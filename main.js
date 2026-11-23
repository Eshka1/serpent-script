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

// ---------- the serpent ----------
const PADDING = 10       // empty space kept around the body
const MIN_GAP = 60       // gaps narrower than this are skipped
const SEGMENTS = 24      // how many circles make up the body
const HEAD_RADIUS = 30
const TAIL_RADIUS = 6
const SPACING = 14       // distance between neighbouring circles

// Build the body: a row of circles that get smaller towards the tail
const serpent = []
for (let i = 0; i < SEGMENTS; i++) {
    const t = i / (SEGMENTS - 1)                 // 0 at the head, 1 at the tail
    serpent.push({
        x: innerWidth / 2 - i * SPACING,
        y: 240,
        r: HEAD_RADIUS + (TAIL_RADIUS - HEAD_RADIUS) * t,
    })
}

const head = serpent[0]
const target = { x: head.x, y: head.y }

addEventListener('pointermove', (e) => {
    target.x = e.clientX
    target.y = e.clientY
})

// Move the head towards the mouse, then let every segment follow the one in front
function updateSerpent() {
    head.x += (target.x - head.x) * 0.12
    head.y += (target.y - head.y) * 0.12

    for (let i = 1; i < serpent.length; i++) {
        const prev = serpent[i - 1]
        const seg = serpent[i]
        const dx = seg.x - prev.x
        const dy = seg.y - prev.y
        const dist = Math.hypot(dx, dy) || 1
        // keep exactly SPACING pixels behind the previous segment
        seg.x = prev.x + (dx / dist) * SPACING
        seg.y = prev.y + (dy / dist) * SPACING
    }
}

// Which part of this row does one circle cover? (null = none)
function blockedRange(c, rowTop, rowBottom) {
    const closestY = Math.max(rowTop, Math.min(c.y, rowBottom))
    const dy = Math.abs(c.y - closestY)
    const r = c.r + PADDING
    if (dy >= r) return null
    const half = Math.sqrt(r * r - dy * dy)
    return { left: c.x - half, right: c.x + half }
}

// Collect the blocked pieces from every segment, merge overlaps, return the free gaps
function freeGaps(left, right, rowTop, rowBottom) {
    const blocked = []
    for (const seg of serpent) {
        const range = blockedRange(seg, rowTop, rowBottom)
        if (range !== null) blocked.push(range)
    }
    blocked.sort((a, b) => a.left - b.left)

    const gaps = []
    let x = left                                 // start of the current free space
    for (const range of blocked) {
        const end = Math.min(right, range.left)
        if (end - x >= MIN_GAP) gaps.push({ x, width: end - x })
        x = Math.max(x, range.right)               // jump past this blocked piece
    }
    if (right - x >= MIN_GAP) gaps.push({ x, width: right - x })
    return gaps
}

// ---------- drawing ----------
function drawSerpent() {
    // draw from tail to head so the head ends up on top
    for (let i = serpent.length - 1; i >= 0; i--) {
        const seg = serpent[i]
        const t = i / (serpent.length - 1)
        // colour fades from bright orange (head) to deep red (tail)
        const red = 255
        const green = Math.round(140 - 110 * t)
        const blue = Math.round(60 - 40 * t)
        ctx.beginPath()
        ctx.arc(seg.x, seg.y, seg.r, 0, Math.PI * 2)
        ctx.fillStyle = `rgb(${red}, ${green}, ${blue})`
        ctx.fill()
    }

    // eyes, pointing the way the head is moving
    const neck = serpent[1]
    const angle = Math.atan2(head.y - neck.y, head.x - neck.x)
    for (const side of [-1, 1]) {
        const ex = head.x + Math.cos(angle) * 12 + Math.cos(angle + Math.PI / 2) * side * 11
        const ey = head.y + Math.sin(angle) * 12 + Math.sin(angle + Math.PI / 2) * side * 11
        ctx.beginPath()
        ctx.arc(ex, ey, 4, 0, Math.PI * 2)
        ctx.fillStyle = '#0b0b0f'
        ctx.fill()
    }
}

function drawText() {
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
        const gaps = freeGaps(columnLeft, columnRight, y, y + LINE_HEIGHT)
        for (const gap of gaps) {
            const line = layoutNextLine(prepared, gap.width, cursor)
            if (line === null) { finished = true; break }
            ctx.fillText(line.text, gap.x, y)
            cursor = line.end
        }
        y += LINE_HEIGHT
    }
}

// ---------- animation loop ----------
function loop() {
    updateSerpent()
    ctx.clearRect(0, 0, innerWidth, innerHeight)
    drawText()
    drawSerpent()
    requestAnimationFrame(loop)
}

resize()
addEventListener('resize', resize)
requestAnimationFrame(loop)