#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Lemon Music · Essentia 情绪效价/唤醒度预测（测试通道）

组件说明（串联，不是二选一）:
  - Essentia (+ TensorFlow)：开源音频分析库，负责加载音频与跑 TF 图
  - MusiCNN (msd-musicnn-1.pb)：把波形编成音乐 embedding（特征表示）
  - emoMusic (emomusic-msd-musicnn-2.pb)：在 embedding 上预测
      arousal（平静↔激昂）与 valence（悲伤↔开心）

依赖（可选，仅 AI 模式需要）:
  pip install essentia-tensorflow

用法:
  python mood_essentia_predict.py --audio /path/to.wav --models-dir /path/to/models
  → stdout JSON
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import traceback


def fail(msg: str, code: int = 1, **extra):
    print(json.dumps({"ok": False, "error": msg, **extra}, ensure_ascii=False))
    sys.exit(code)


def clamp(n, lo, hi):
    return max(lo, min(hi, n))


def map_1_9_to_signed(v: float) -> float:
    """emoMusic / DEAM 标注区间 [1, 9] → [-1, 1]"""
    return clamp(((float(v) - 1.0) / 8.0) * 2.0 - 1.0, -1.0, 1.0)


def predict(audio_path: str, models_dir: str):
    try:
        from essentia.standard import MonoLoader, TensorflowPredictMusiCNN, TensorflowPredict2D
    except Exception as e:
        fail(
            "未安装 essentia-tensorflow。请执行: pip install essentia-tensorflow",
            installHint="pip install essentia-tensorflow",
            detail=str(e),
        )

    # MusiCNN：特征提取；emoMusic：情绪头（必须接在 MusiCNN embedding 之后）
    emb_path = os.path.join(models_dir, "msd-musicnn-1.pb")
    head_path = os.path.join(models_dir, "emomusic-msd-musicnn-2.pb")
    if not os.path.isfile(emb_path) or not os.path.isfile(head_path):
        fail("模型文件缺失，请先在应用内下载 Essentia 模型", missing=[emb_path, head_path])

    if not os.path.isfile(audio_path):
        fail(f"音频不存在: {audio_path}")

    audio = MonoLoader(filename=audio_path, sampleRate=16000, resampleQuality=4)()
    if audio is None or len(audio) < 16000 * 3:
        fail("音频过短或解码失败")

    # ① 音频 → MusiCNN embedding
    embedding_model = TensorflowPredictMusiCNN(
        graphFilename=emb_path,
        output="model/dense/BiasAdd",
    )
    embeddings = embedding_model(audio)

    # ② embedding → emoMusic (arousal, valence)
    model = TensorflowPredict2D(
        graphFilename=head_path,
        output="model/Identity",
    )
    predictions = model(embeddings)

    # 常见输出: [[arousal, valence], ...] 多帧取均值
    rows = []
    try:
        for row in predictions:
            rows.append([float(row[0]), float(row[1])])
    except Exception:
        # 单向量
        flat = [float(x) for x in list(predictions)]
        if len(flat) >= 2:
            rows = [[flat[0], flat[1]]]
        else:
            fail("模型输出无法解析", raw=str(predictions)[:200])

    if not rows:
        fail("模型无有效输出")

    a_sum = sum(r[0] for r in rows)
    v_sum = sum(r[1] for r in rows)
    n = float(len(rows))
    arousal_raw = a_sum / n
    valence_raw = v_sum / n

    # 部分权重输出顺序可能是 [valence, arousal]；用元数据提示，默认按 Essentia 文档 arousal, valence
    # 若数值都在 [1,9] 外则再做一次兜底归一
    def maybe_rescale(x):
        if 1.0 <= x <= 9.0:
            return map_1_9_to_signed(x)
        if 0.0 <= x <= 1.0:
            return clamp(x * 2.0 - 1.0, -1.0, 1.0)
        return clamp(x, -1.0, 1.0)

    arousal = maybe_rescale(arousal_raw)
    valence = maybe_rescale(valence_raw)

    print(json.dumps({
        "ok": True,
        "engine": "essentia-emomusic",
        "valence": round(valence, 4),
        "arousal": round(arousal, 4),
        "raw": {
            "arousal": round(arousal_raw, 4),
            "valence": round(valence_raw, 4),
            "frames": len(rows),
        },
    }, ensure_ascii=False))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--audio", required=True)
    parser.add_argument("--models-dir", required=True)
    args = parser.parse_args()
    try:
        predict(args.audio, args.models_dir)
    except SystemExit:
        raise
    except Exception as e:
        fail(str(e), trace=traceback.format_exc()[-1500:])


if __name__ == "__main__":
    main()
