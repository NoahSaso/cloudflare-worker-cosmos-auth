import { respond } from '../utils'

export const handlePing = async (): Promise<Response> =>
  respond(200, { pong: true })
