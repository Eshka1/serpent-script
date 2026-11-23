import { prepareWithSegments, layoutNextLine } from 'https://cdn.jsdelivr.net/npm/@chenglou/pretext@1.0.0/dist/layout.js'

// ---------- settings ----------
const FONT = '15px "IBM Plex Mono", monospace'
const LINE_HEIGHT = 24
const MAX_COLUMN_WIDTH = 680
const TOP_MARGIN = 80

const TEXT = `Somewhere beneath this page a serpent is waking up. It does not read the words, it moves through them, and every line has to make room. Normally a browser would measure the whole page again each time something moves, which is slow. Here the text is measured only once. After that, every line is placed with simple arithmetic: how much space is free in this row, and how many words fit into it. That is the whole trick behind serpent-script. The words never touch the DOM. They are painted straight onto a canvas, one line at a time, sixty times a second, bending around whatever stands in their way. Scroll down and watch the serpent travel. Move your mouse and it will follow you. Each letter it brushes past will step aside and settle back into place once it has gone.`

// ---------- canvas setup ----------
const canvas = document.getElementById('stage')
const ctx = canvas.getContext('2d')

function resize() {
    const dpr = window.devicePixelRatio || 1   // sharp text on high-DPI screens
    canvas.width = innerWidth * dpr
    canvas.height = innerHeight * dpr
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)     // draw in CSS pixels
}

// ---------- step 1: measure the text once ----------
await document.fonts.load(FONT)              // wait for the web font first
const prepared = prepareWithSegments(TEXT, FONT)

// ---------- the obstacle (a circle for now) ----------
const PADDING = 12   // empty space kept around the circle
const MIN_GAP = 60   // gaps narrower than this are skipped

const circle = { x: innerWidth / 2, y: 240, r: 70 }   // where it is drawn
const target = { x: circle.x, y: circle.y }           // where it wants to go

addEventListener('pointermove', (e) => {
    target.x = e.clientX
    target.y = e.clientY
})

// Which part of this row does the circle cover? (null = none)
function blockedRange(c, rowTop, rowBottom) {
    const closestY = Math.max(rowTop, Math.min(c.y, rowBottom))  // nearest point of the row to the centre
    const dy = Math.abs(c.y - closestY)
    const r = c.r + PADDING
    if (dy >= r) return null                  // the row misses the circle
    const half = Math.sqrt(r * r - dy * dy)   // Pythagoras: half-width of the circle at this height
    return { left: c.x - half, right: c.x + half }
}

// Split the row into free gaps on the left and right of the circle
function freeGaps(left, right, blocked) {
    if (blocked === null) return [{ x: left, width: right - left }]
    const gaps = []
    const leftEnd = Math.min(right, blocked.left)
    const rightStart = Math.max(left, blocked.right)
    if (leftEnd - left >= MIN_GAP) gaps.push({ x: left, width: leftEnd - left })
    if (right - rightStart >= MIN_GAP) gaps.push({ x: rightStart, width: right - rightStart })
    return gaps
}

// ---------- lay out and draw ----------
function draw() {
    ctx.clearRect(0, 0, innerWidth, innerHeight)

    // the circle
    ctx.beginPath()
    ctx.arc(circle.x, circle.y, circle.r, 0, Math.PI * 2)
    ctx.fillStyle = '#ff8a3d'
    ctx.fill()

    // the text
    ctx.font = FONT
    ctx.fillStyle = '#c9c9d1'
    ctx.textBaseline = 'top'

    const columnWidth = Math.min(MAX_COLUMN_WIDTH, innerWidth - 48)
    const columnLeft = (innerWidth - columnWidth) / 2
    const columnRight = columnLeft + columnWidth
    let y = TOP_MARGIN
    let cursor = { segmentIndex: 0, graphemeIndex: 0 }
    let finished = false

    while (!finished && y < innerHeight) {
        const blocked = blockedRange(circle, y, y + LINE_HEIGHT)
        const gaps = freeGaps(columnLeft, columnRight, blocked)

        for (const gap of gaps) {
            const line = layoutNextLine(prepared, gap.width, cursor)
            if (line === null) { finished = true; break }
            ctx.fillText(line.text, gap.x, y)
            cursor = line.end      // the next gap continues from here
        }
        y += LINE_HEIGHT         // next row (even if the circle filled this one)
    }
}

// ---------- animation loop ----------
function loop() {
    // ease towards the mouse instead of jumping
    circle.x += (target.x - circle.x) * 0.15
    circle.y += (target.y - circle.y) * 0.15
    draw()
    requestAnimationFrame(loop)
}

resize()
addEventListener('resize', resize)
requestAnimationFrame(loop)