// Which environment served this page. The same build runs in staging and
// production, so it's decided here, where the code runs, from the hostname,
// rather than baked in at build time.
export type Environment = 'production' | 'staging' | 'local'

const host = location.hostname

export const environment: Environment = host.includes('staging')
  ? 'staging'
  : host === 'localhost' || host === '127.0.0.1'
    ? 'local'
    : 'production'
