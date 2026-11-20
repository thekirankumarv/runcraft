import type { ServiceConfig } from './types'

export interface Template extends Partial<ServiceConfig> {
  key: string
  name: string
  icon: string
  command: string
  hint: string
}

export const TEMPLATES: Template[] = [
  { key: 'custom', name: 'Custom command', icon: 'terminal', command: '', hint: 'Anything you would type in a terminal' },
  { key: 'next', name: 'Next.js', icon: 'globe', command: 'npm run dev', port: 3000, hint: 'React framework dev server' },
  { key: 'vite', name: 'Vite', icon: 'globe', command: 'npm run dev', port: 5173, hint: 'React, Vue, Svelte, Solid' },
  { key: 'node', name: 'Node API', icon: 'server', command: 'node --watch src/index.js', port: 4000, hint: 'Express, Fastify, Hono' },
  { key: 'nest', name: 'NestJS', icon: 'server', command: 'npm run start:dev', port: 3000, hint: 'Watch mode' },
  { key: 'django', name: 'Django', icon: 'server', command: 'python manage.py runserver', port: 8000, hint: 'Python web framework' },
  { key: 'fastapi', name: 'FastAPI', icon: 'server', command: 'uvicorn main:app --reload --port 8000', port: 8000, hint: 'Uvicorn with reload' },
  { key: 'rails', name: 'Rails', icon: 'server', command: 'bin/rails server', port: 3000, hint: 'Ruby on Rails' },
  { key: 'go', name: 'Go', icon: 'server', command: 'go run .', hint: 'Run a Go module' },
  {
    key: 'postgres',
    name: 'Postgres',
    icon: 'database',
    command: 'docker run --rm --name runcraft-postgres -p 5432:5432 -e POSTGRES_PASSWORD=postgres postgres:16',
    port: 5432,
    hint: 'Docker, user/pass postgres',
  },
  { key: 'redis', name: 'Redis', icon: 'database', command: 'docker run --rm --name runcraft-redis -p 6379:6379 redis:7', port: 6379, hint: 'Docker' },
  { key: 'mongo', name: 'MongoDB', icon: 'database', command: 'docker run --rm --name runcraft-mongo -p 27017:27017 mongo:7', port: 27017, hint: 'Docker' },
  { key: 'compose', name: 'Docker Compose', icon: 'box', command: 'docker compose up', hint: 'Whole compose stack' },
  { key: 'worker', name: 'Background worker', icon: 'cog', command: 'npm run worker', autoRestart: true, hint: 'Queues, jobs, consumers' },
  { key: 'cron', name: 'Cron / scheduler', icon: 'clock', command: 'npm run cron', autoRestart: true, hint: 'Scheduled tasks' },
  { key: 'socket', name: 'WebSocket server', icon: 'radio', command: 'npm run dev:socket', hint: 'Realtime gateway' },
  { key: 'stripe', name: 'Stripe webhooks', icon: 'zap', command: 'stripe listen --forward-to localhost:3000/api/webhooks', hint: 'Forward test events' },
  { key: 'ngrok', name: 'ngrok tunnel', icon: 'cloud', command: 'ngrok http 3000', hint: 'Public URL for a local port' },
  {
    key: 'mail',
    name: 'Mailpit',
    icon: 'mail',
    command: 'docker run --rm --name runcraft-mailpit -p 8025:8025 -p 1025:1025 axllent/mailpit',
    port: 8025,
    hint: 'Catch outgoing email',
  },
]
