import { prepareWithSegments, layoutNextLine, layout } from 'https://cdn.jsdelivr.net/npm/@chenglou/pretext@1.0.0/dist/layout.js'

// ---------- settings ----------
const FONT = '15px "IBM Plex Mono", monospace'
const LINE_HEIGHT = 24
const PARAGRAPH_GAP = 24      // empty space between paragraphs
const MAX_COLUMN_WIDTH = 680
const TOP_MARGIN = 300        // room for the big title above the text
const TITLE = 'SERPENT'
const TITLE_FONT_FAMILY = '"Playfair Display", serif'

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
await document.fonts.load(`700 100px ${TITLE_FONT_FAMILY}`)
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

    layoutTitle()
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
        x: innerWidth / 2,
        y: innerHeight * 0.45 - i * SPACING,
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

// ---------- big title: letters that get pushed and spring back ----------
const titleLetters = []
let titleFont = ''

function layoutTitle() {
    const { width } = columnBounds()
    const size = Math.min(150, width / 4.2)
    titleFont = `700 ${size}px ${TITLE_FONT_FAMILY}`
    ctx.font = titleFont
    const letterSpacing = size * 0.06
    const widths = [...TITLE].map((ch) => ctx.measureText(ch).width)
    const total = widths.reduce((a, b) => a + b, 0) + letterSpacing * (TITLE.length - 1)

    let x = (innerWidth - total) / 2
    const y = TOP_MARGIN - 70                     // baseline of the title
        ;[...TITLE].forEach((ch, i) => {
            const homeX = x + widths[i] / 2             // centre of the letter
            const old = titleLetters[i]
            titleLetters[i] = {
                ch, homeX, homeY: y,
                x: old ? old.x : homeX, y: old ? old.y : y,
                vx: old ? old.vx : 0, vy: old ? old.vy : 0,
                radius: size * 0.35,                      // how close the serpent must get
            }
            x += widths[i] + letterSpacing
        })
}

function updateTitle() {
    for (const L of titleLetters) {
        // spring pulls the letter back home
        let ax = (L.homeX - L.x) * 0.03
        let ay = (L.homeY - L.y) * 0.03
        // every segment close enough pushes the letter away
        for (const seg of serpent) {
            const dx = L.x - seg.x
            const dy = (L.y - L.radius) - seg.y        // compare with the letter's middle, not its baseline
            const dist = Math.hypot(dx, dy) || 1
            const reach = seg.r + L.radius
            if (dist < reach) {
                const push = ((reach - dist) / reach) * 2.2
                ax += (dx / dist) * push
                ay += (dy / dist) * push
            }
        }
        L.vx = (L.vx + ax) * 0.88                   // 0.88 = friction, so it settles
        L.vy = (L.vy + ay) * 0.88
        L.x += L.vx
        L.y += L.vy
    }
}

function drawTitle() {
    ctx.font = titleFont
    ctx.textAlign = 'center'
    ctx.textBaseline = 'alphabetic'
    ctx.lineWidth = 1.5
    for (const L of titleLetters) {
        const offset = Math.hypot(L.x - L.homeX, L.y - L.homeY)
        const glow = Math.min(1, offset / 40)       // 0 at home, 1 when knocked away
        ctx.save()
        ctx.translate(L.x, L.y)
        ctx.rotate((L.x - L.homeX) * 0.004)         // tilt a little while displaced
        ctx.strokeStyle = `rgba(255, ${Math.round(255 - 115 * glow)}, ${Math.round(255 - 195 * glow)}, ${0.16 + 0.6 * glow})`
        ctx.strokeText(L.ch, 0, 0)
        ctx.restore()
    }
    ctx.textAlign = 'left'
}

// ---------- glyph particles that break off the head ----------
const GLYPHS = PARAGRAPHS.join('').replace(/\s/g, '')
const particles = []
let spawnBudget = 0
let lastHead = { x: head.x, y: head.y }

function updateParticles() {
    const speed = Math.hypot(head.x - lastHead.x, head.y - lastHead.y)
    lastHead = { x: head.x, y: head.y }

    spawnBudget += speed * 0.12                   // faster serpent = more letters
    while (spawnBudget >= 1 && particles.length < 250) {
        spawnBudget -= 1
        const a = Math.random() * Math.PI * 2
        particles.push({
            ch: GLYPHS[Math.floor(Math.random() * GLYPHS.length)],
            x: head.x + Math.cos(a) * HEAD_RADIUS,
            y: head.y + Math.sin(a) * HEAD_RADIUS,
            vx: Math.cos(a) * (0.4 + Math.random()),
            vy: Math.sin(a) * (0.4 + Math.random()),
            life: 1,
            size: 10 + Math.random() * 8,
        })
    }
    spawnBudget = Math.min(spawnBudget, 1)

    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i]
        p.x += p.vx
        p.y += p.vy
        p.vx *= 0.97
        p.vy = p.vy * 0.97 - 0.01                   // drift slowly upwards
        p.life -= 0.012
        if (p.life <= 0) particles.splice(i, 1)
    }
}

function drawParticles() {
    ctx.textBaseline = 'middle'
    for (const p of particles) {
        ctx.globalAlpha = p.life
        ctx.font = `${p.size.toFixed(0)}px "IBM Plex Mono", monospace`
        ctx.fillStyle = '#ffb36b'
        ctx.fillText(p.ch, p.x, p.y)
    }
    ctx.globalAlpha = 1
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
    // soft glow behind the head ('lighter' adds light instead of covering)
    ctx.globalCompositeOperation = 'lighter'
    const glow = ctx.createRadialGradient(head.x, head.y, 0, head.x, head.y, HEAD_RADIUS * 5)
    glow.addColorStop(0, 'rgba(255, 140, 60, 0.35)')
    glow.addColorStop(1, 'rgba(255, 140, 60, 0)')
    ctx.fillStyle = glow
    ctx.beginPath()
    ctx.arc(head.x, head.y, HEAD_RADIUS * 5, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalCompositeOperation = 'source-over'

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

function drawScrollHint() {
    const alpha = Math.max(0, 1 - scrollY / 200) * 0.45   // fades out as you scroll
    if (alpha <= 0) return
    ctx.font = FONT
    ctx.textAlign = 'center'
    ctx.textBaseline = 'alphabetic'
    ctx.fillStyle = `rgba(201, 201, 209, ${alpha})`
    ctx.fillText('scroll ↓  or move your mouse', innerWidth / 2, TOP_MARGIN - 40)
    ctx.textAlign = 'left'
}

// ---------- animation loop ----------
function loop(time) {
    updateSerpent(time)
    updateTitle()
    updateParticles()

    ctx.clearRect(0, 0, innerWidth, innerHeight)
    ctx.save()
    ctx.translate(0, -scrollY)       // shift the whole page up by how far we've scrolled
    drawTitle()
    drawScrollHint()
    drawText()
    drawParticles()
    drawSerpent()
    ctx.restore()

    requestAnimationFrame(loop)
}

resize()
addEventListener('resize', resize)
requestAnimationFrame(loop)