// Joins the two recorded peers side by side and writes docs/demo.gif under 5 MB.
import { spawnSync } from 'node:child_process'
import { mkdirSync, statSync } from 'node:fs'

const LIMIT = 5_242_880
const a = 'demo-video/a.webm'
const b = 'demo-video/b.webm'
const out = 'docs/demo.gif'
// Both recordings open on about a second of blank page while the browser starts.
const TRIM = '1.8'
const palette = 'demo-video/palette.png'

function ffmpeg(args) {
  const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', ...args], { stdio: 'inherit' })
  if (r.error) {
    console.error('ffmpeg not found on PATH. Install ffmpeg and retry.')
    process.exit(1)
  }
  if (r.status !== 0) {
    console.error(`ffmpeg failed with status ${r.status}`)
    process.exit(r.status ?? 1)
  }
}

function render(fps, width) {
  const base = `[0:v][1:v]hstack=inputs=2:shortest=1,fps=${fps},scale=${width}:-1:flags=lanczos`
  ffmpeg(['-ss', TRIM, '-i', a, '-ss', TRIM, '-i', b, '-filter_complex', `${base},palettegen=max_colors=128:stats_mode=diff`, '-frames:v', '1', '-update', '1', palette])
  ffmpeg([
    '-ss', TRIM, '-i', a, '-ss', TRIM, '-i', b, '-i', palette,
    '-filter_complex', `${base}[x];[x][2:v]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle`,
    '-loop', '0', out,
  ])
  return statSync(out).size
}

mkdirSync('docs', { recursive: true })
for (const [fps, width] of [[10, 1280], [8, 1280], [8, 1024]]) {
  const size = render(fps, width)
  console.log(`fps=${fps} width=${width} size=${size} bytes`)
  if (size < LIMIT) {
    console.log(`wrote ${out}: ${size} bytes`)
    process.exit(0)
  }
}
console.error(`Could not get ${out} under ${LIMIT} bytes. Shorten the recording or lower the size.`)
process.exit(1)
