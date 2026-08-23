import { Router } from 'express'
import { settingsRouter } from './settings.js'
import { sourceRouter } from './source.js'
import { searchRouter } from './search.js'
import { playlistRouter } from './playlist.js'
import { downloadRouter } from './download.js'
import { tagRouter } from './tag.js'
import { playRouter } from './play.js'
import { pathsRouter } from './paths.js'
import { aboutRouter } from './about.js'

export const apiRouter = Router()

apiRouter.use('/settings', settingsRouter)
apiRouter.use('/source', sourceRouter)
apiRouter.use('/search', searchRouter)
apiRouter.use('/playlist', playlistRouter)
apiRouter.use('/download', downloadRouter)
apiRouter.use('/tag', tagRouter)
apiRouter.use('/play', playRouter)
apiRouter.use('/paths', pathsRouter)
apiRouter.use('/about', aboutRouter)
