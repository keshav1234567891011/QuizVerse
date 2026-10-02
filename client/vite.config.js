import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import { resolveApiBase } from './src/config/apiBase.js'
import { cwd } from 'node:process'

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {
  if (command === 'build') resolveApiBase(loadEnv(mode, cwd(), 'VITE_').VITE_API_URL, true)
  return { plugins: [react()] }
})
