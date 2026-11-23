import { prepareWithSegments, layoutNextLine, layout } from 'https://cdn.jsdelivr.net/npm/@chenglou/pretext@1.0.0/dist/layout.js'

// ---------- settings ----------
const FONT = '15px "IBM Plex Mono", monospace'
const LINE_HEIGHT = 24
const PARAGRAPH_GAP = 24      // empty space between paragraphs
const MAX_COLUMN_WIDTH = 680
const TOP_MARGIN = 120

const PARAGRAPHS = [
    `Somewhere beneath this page a serpent is waking up. It does not read the words, it moves through them, and every line has to make room. Scroll down and it will travel with you. Move your mouse and it will follow you instead.`,
    `Normally a browser would measure the whole page again every time something moves. That measuring step is called reflow, and it is one of the slowest things a web page can do. Doing it sixty times a second while a creature slides through a paragraph would make the page stutter.`,
    `This page takes a different route. Before anything moves, every word is measured exactly once with the browser's own font engine, and the widths are kept in memory. From then on, placing a line of text is just arithmetic: how much space is free in this row, and how many of those known widths fit into it.`,
    `Each row is checked against the serpent's body. Wherever the body crosses the row, that part is blocked, and the free space splits into gaps. A row can have one gap, two gaps, or three when the body curls into a U. Each gap is filled with as many words as will fit, left to right.`,
    `A small cursor remembers exactly where the last gap stopped, down to the letter. The next gap picks up from that point, so the sentence carries on across the serpent without losing a single word. When the paragraph runs out of words, the cursor simply reports that there is nothing left.`,
    `The serpent itself is a chain of circles. The head eases towards a target, and every circle behind it moves so that it sits a fixed distance behind the one in front. Nothing more is needed for the body to bend, trail and coil in a way that feels alive.`,
    `When you scroll, the target slides down the page and sways from side to side, so the serpent weaves through the paragraphs as you read. Stop scrolling and it waits, swaying gently. Move the mouse and it comes to find you.`,
    `The words never touch the DOM. They are painted onto a single canvas, one line at a time, every frame. That is the whole trick behind serpent-script, and it is small enough to read in one sitting.`,
]

// ---------- canvas setup ----------
const canvas = document.getElementById('stage')
const ctx = canvas.getContext('2d')
const scrollSpace = document.getElementById('scroll-space')

// ---------- measure every paragraph once ----------
await document.fonts.load(FONT)
const prepared = PARAGRAPHS.map((text) => prepareWithSegments(text, FONT))

function columnBounds() {
    const width = Math.min(MAX_COLUMN_WIDTH, innerWidth - 48)
    const left = (innerWidth - width) / 2
    return { left, right: left + width, width }
}

function resize() {
    const dpr = window.devicePixelRatio || 1
    canvas.width = innerWidth * dpr
    canvas.height = innerHeight * dpr
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    // Make the page tall enough to scroll through all the text.
    // layout() gives the height without the serpent; the extra half screen covers
    // the rows the serpent pushes down and leaves room at the end.
    const { width } = columnBounds()
    let height = TOP_MARGIN
    for (const p of prepared) height += layout(p, width, LINE_HEIGHT).height + PARAGRAPH_GAP
    scrollSpace.style.height = `${height + innerHeight * 0.5}px`
}

// ---------- the serpent (in page coordinates) ----------
const PADDING = 10
const MIN_GAP = 60
const SEGMENTS = 24
const HEAD_RADIUS = 30
const TAIL_RADIUS = 6
const SPACING = 14
const MOUSE_TIMEOUT = 2000    // ms: follow the mouse this long after it last moved

const serpent = []
for (let i = 0; i < SEGMENTS; i++) {
    const t = i / (SEGMENTS - 1)
    serpent.push({
        x: innerWidth / 2 - i * SPACING,
        y: TOP_MARGIN + 150,
        r: HEAD_RADIUS + (TAIL_RADIUS - HEAD_RADIUS) * t,
    })
}
const head = serpent[0]

const mouse = { x: 0, y: 0, lastMove: -Infinity }
addEventListener('pointermove', (e) => {
    mouse.x = e.clientX
    mouse.y = e.clientY
    mouse.lastMove = performance.now()
})
// scrolling hands control back to the scroll path
addEventListener('scroll', () => { mouse.lastMove = -Infinity })

// Where should the head go when we're scrolling?
function scrollTarget(time) {
    const { left, width } = columnBounds()
    const y = scrollY + innerHeight * 0.45            // a bit above the middle of the screen
    const sway = Math.sin(y / 160 + time * 0.0008)    // weave left and right
    return { x: left + width / 2 + sway * width * 0.35, y }
}

function updateSerpent(time) {
    const followMouse = time - mouse.lastMove < MOUSE_TIMEOUT
    const target = followMouse
        ? { x: mouse.x, y: mouse.y + scrollY }          // screen -> page coordinates
        : scrollTarget(time)
    const ease = followMouse ? 0.12 : 0.06

    head.x += (target.x - head.x) * ease
    head.y += (target.y - head.y) * ease

    for (let i = 1; i < serpent.length; i++) {
        const prev = serpent[i - 1]
        const seg = serpent[i]
        const dx = seg.x - prev.x
        const dy = seg.y - prev.y
        const dist = Math.hypot(dx, dy) || 1
        seg.x = prev.x + (dx / dist) * SPACING
        seg.y = prev.y + (dy / dist) * SPACING
    }
}

function blockedRange(c, rowTop, rowBottom) {
    const closestY = Math.max(rowTop, Math.min(c.y, rowBottom))
    const dy = Math.abs(c.y - closestY)
    const r = c.r + PADDING
    if (dy >= r) return null
    const half = Math.sqrt(r * r - dy * dy)
    return { left: c.x - half, right: c.x + half }
}

function freeGaps(left, right, rowTop, rowBottom) {
    const blocked = []
    for (const seg of serpent) {
        const range = blockedRange(seg, rowTop, rowBottom)
        if (range !== null) blocked.push(range)
    }
    blocked.sort((a, b) => a.left - b.left)

    const gaps = []
    let x = left
    for (const range of blocked) {
        const end = Math.min(right, range.left)
        if (end - x >= MIN_GAP) gaps.push({ x, width: end - x })
        x = Math.max(x, range.right)
    }
    if (right - x >= MIN_GAP) gaps.push({ x, width: right - x })
    return gaps
}

// ---------- drawing (everything in page coordinates) ----------
function drawText() {
    ctx.font = FONT
    ctx.fillStyle = '#c9c9d1'
    ctx.textBaseline = 'top'

    const { left, right } = columnBounds()
    const viewTop = scrollY
    const viewBottom = scrollY + innerHeight
    let y = TOP_MARGIN

    for (const p of prepared) {
        let cursor = { segmentIndex: 0, graphemeIndex: 0 }
        let finished = false

        while (!finished) {
            if (y > viewBottom) return                    // below the screen: stop working
            const gaps = freeGaps(left, right, y, y + LINE_HEIGHT)
            let drewSomething = false

            for (const gap of gaps) {
                const line = layoutNextLine(p, gap.width, cursor)
                if (line === null) { finished = true; break }
                if (y + LINE_HEIGHT > viewTop) ctx.fillText(line.text, gap.x, y)  // only paint visible rows
                cursor = line.end
                drewSomething = true
            }
            // don't leave an empty row when the paragraph ended exactly at a row's start
            if (!(finished && !drewSomething)) y += LINE_HEIGHT
        }
        y += PARAGRAPH_GAP
    }
}

function drawSerpent() {
    for (let i = serpent.length - 1; i >= 0; i--) {
        const seg = serpent[i]
        const t = i / (serpent.length - 1)
        const green = Math.round(140 - 110 * t)
        const blue = Math.round(60 - 40 * t)
        ctx.beginPath()
        ctx.arc(seg.x, seg.y, seg.r, 0, Math.PI * 2)
        ctx.fillStyle = `rgb(255, ${green}, ${blue})`
        ctx.fill()
    }

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

// ---------- animation loop ----------
function loop(time) {
    updateSerpent(time)

    ctx.clearRect(0, 0, innerWidth, innerHeight)
    ctx.save()
    ctx.translate(0, -scrollY)       // shift the whole page up by how far we've scrolled
    drawText()
    drawSerpent()
    ctx.restore()

    requestAnimationFrame(loop)
}

resize()
addEventListener('resize', resize)
requestAnimationFrame(loop)