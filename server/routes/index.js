import { Router } from 'express'
import { authRouter } from './auth.js'
import { settingsRouter } from './settings.js'
import { sourceRouter } from './source.js'
import { searchRouter } from './search.js'
import { albumRouter } from './album.js'
import { playlistRouter } from './playlist.js'
import { downloadRouter } from './download.js'
import { tagRouter } from './tag.js'
import { playRouter } from './play.js'
import { pathsRouter } from './paths.js'
import { aboutRouter } from './about.js'
import { healthRouter } from './health.js'
import { libraryRouter } from './library.js'
import { requireAuth } from '../middleware/auth.js'

export const apiRouter = Router()

apiRouter.use('/auth', authRouter)
apiRouter.use('/health', healthRouter)

apiRouter.use(requireAuth)

apiRouter.use('/settings', settingsRouter)
apiRouter.use('/source', sourceRouter)
apiRouter.use('/search', searchRouter)
apiRouter.use('/album', albumRouter)
apiRouter.use('/playlist', playlistRouter)
apiRouter.use('/download', downloadRouter)
apiRouter.use('/tag', tagRouter)
apiRouter.use('/play', playRouter)
apiRouter.use('/paths', pathsRouter)
apiRouter.use('/about', aboutRouter)
apiRouter.use('/library', libraryRouter)
