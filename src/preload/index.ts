import { contextBridge } from 'electron'
import type { MarcDocApi } from './api'

const api: MarcDocApi = {
  platform: process.platform,
}

contextBridge.exposeInMainWorld('marcdoc', api)
