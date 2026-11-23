import { prepareWithSegments, layoutNextLine, layout } from 'https://cdn.jsdelivr.net/npm/@chenglou/pretext@1.0.0/dist/layout.js'

// ---------- settings ----------
const FONT = '15px "IBM Plex Mono", monospace'
const LINE_HEIGHT = 24
const PARAGRAPH_GAP = 24      // empty space between paragraphs
const MAX_COLUMN_WIDTH = 680
const TOP_MARGIN = 300        // room for the big title above the text
const DEFAULT_TITLE = 'SERPENT'
const MAX_CHARS = 4000       // limit for visitors' own text
const TITLE_FONT_FAMILY = '"Playfair Display", serif'

const DEFAULT_PARAGRAPHS = [
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

// These change when a visitor applies their own text
let title = DEFAULT_TITLE
let paragraphs = DEFAULT_PARAGRAPHS
let prepared = paragraphs.map((text) => prepareWithSegments(text, FONT))

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
    const letters = [...title]

    // measure at 100px, then scale so the title fits 90% of the screen (max 150px)
    ctx.font = `700 100px ${TITLE_FONT_FAMILY}`
    const at100 = letters.reduce((sum, ch) => sum + ctx.measureText(ch).width + 6, 0)
    const size = Math.min(150, (100 * innerWidth * 0.9) / at100)

    titleFont = `700 ${size}px ${TITLE_FONT_FAMILY}`
    ctx.font = titleFont
    const letterSpacing = size * 0.06
    const widths = letters.map((ch) => ctx.measureText(ch).width)
    const total = widths.reduce((a, b) => a + b, 0) + letterSpacing * (letters.length - 1)

    let x = (innerWidth - total) / 2
    const y = TOP_MARGIN - 70                     // baseline of the title
    letters.forEach((ch, i) => {
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
// Array.from splits by character, so Bangla and emoji don't get cut in half
let glyphs = Array.from(paragraphs.join('').replace(/\s/g, ''))
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
            ch: glyphs[Math.floor(Math.random() * glyphs.length)],
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

// ---------- visitors' own text ----------
const editToggle = document.getElementById('edit-toggle')
const editor = document.getElementById('editor')
const titleInput = document.getElementById('title-input')
const textInput = document.getElementById('text-input')
const charCount = document.getElementById('char-count')
const resetButton = document.getElementById('reset-button')

// Blank lines start a new paragraph; single line breaks just become spaces
function toParagraphs(text) {
    return text
        .split(/\n\s*\n/)
        .map((p) => p.replace(/\s+/g, ' ').trim())
        .filter((p) => p.length > 0)
}

function setContent(newTitle, newParagraphs) {
    title = newTitle
    paragraphs = newParagraphs
    prepared = paragraphs.map((text) => prepareWithSegments(text, FONT))   // measure the new text once
    glyphs = Array.from(paragraphs.join('').replace(/\s/g, ''))
    titleLetters.length = 0          // forget the old title's letters
    resize()                         // new page height + new title layout
    scrollTo(0, 0)
}

function updateCount() {
    charCount.textContent = `${textInput.value.length} / ${MAX_CHARS}`
}

function openEditor() {
    titleInput.value = title === DEFAULT_TITLE ? '' : title
    textInput.value = paragraphs === DEFAULT_PARAGRAPHS ? '' : paragraphs.join('\n\n')
    updateCount()
    editor.hidden = false
    textInput.focus()
}

editToggle.addEventListener('click', () => {
    if (editor.hidden) openEditor()
    else editor.hidden = true
})

textInput.addEventListener('input', updateCount)

editor.addEventListener('submit', (e) => {
    e.preventDefault()               // stop the form from reloading the page
    const newParagraphs = toParagraphs(textInput.value.slice(0, MAX_CHARS))
    const newTitle = titleInput.value.trim().toUpperCase() || DEFAULT_TITLE
    setContent(newTitle, newParagraphs.length > 0 ? newParagraphs : DEFAULT_PARAGRAPHS)
    editor.hidden = true
})

resetButton.addEventListener('click', () => {
    setContent(DEFAULT_TITLE, DEFAULT_PARAGRAPHS)
    editor.hidden = true
})

addEventListener('keydown', (e) => {
    if (e.key === 'Escape') editor.hidden = true
})
// ---------- funky background (drawn in screen coordinates) ----------
const GRID = 34                 // distance between dots
const GLOW_RADIUS = 220         // how far around the head the dots light up
const GHOST_CHARS = '{}[]<>/=+*#&%@~01ABCDEFGHIJKLMNOPQRSTUVWXYZ'
const TICKER = 'SERPENT-SCRIPT  ·  BUILT WITH PRETEXT  ·  CANVAS  ·  NO DOM REFLOW  ·  '

// big faint characters floating at different depths
const ghosts = []
for (let i = 0; i < 36; i++) {
    const depth = Math.random()                   // 0 = far away, 1 = close
    ghosts.push({
        ch: GHOST_CHARS[Math.floor(Math.random() * GHOST_CHARS.length)],
        x: Math.random() * innerWidth,
        y: Math.random() * innerHeight,
        size: 30 + depth * 90,                      // closer = bigger
        depth,
        rot: Math.random() * Math.PI * 2,
        spin: (Math.random() - 0.5) * 0.004,
    })
}

// wrap a value into 0..size (like the screen wrapping around in old games)
function wrap(value, size) {
    return ((value % size) + size) % size
}

function drawDotGrid(time) {
    const offsetY = -wrap(scrollY * 0.4, GRID)    // parallax: dots move slower than the text
    const startX = (innerWidth % GRID) / 2

    // pass 1: every dot, dim
    ctx.fillStyle = 'rgba(255, 255, 255, 0.07)'
    for (let y = offsetY; y < innerHeight + GRID; y += GRID) {
        for (let x = startX; x < innerWidth; x += GRID) ctx.fillRect(x - 1, y - 1, 2, 2)
    }

    // pass 2: only the dots near the head, glowing in rippling rings
    const hx = head.x
    const hy = head.y - scrollY                   // page -> screen coordinates
    for (let y = offsetY; y < innerHeight + GRID; y += GRID) {
        if (Math.abs(y - hy) > GLOW_RADIUS) continue
        for (let x = startX; x < innerWidth; x += GRID) {
            const d = Math.hypot(x - hx, y - hy)
            if (d > GLOW_RADIUS) continue
            const near = 1 - d / GLOW_RADIUS                           // 1 at the head, 0 at the edge
            const ripple = Math.sin(d * 0.05 - time * 0.005) * 0.5 + 0.5
            const size = 2 + near * 5 * ripple
            ctx.fillStyle = `rgba(255, ${Math.round(120 + 80 * ripple)}, 70, ${near * (0.3 + 0.6 * ripple)})`
            ctx.fillRect(x - size / 2, y - size / 2, size, size)
        }
    }
}

function drawGhosts() {
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.lineWidth = 1
    for (const g of ghosts) {
        g.y -= 0.1 + g.depth * 0.3                  // drift upwards, close ones faster
        g.rot += g.spin
        const y = wrap(g.y - scrollY * g.depth * 0.6, innerHeight + 200) - 100   // parallax + wrap
        ctx.save()
        ctx.translate(g.x, y)
        ctx.rotate(g.rot)
        ctx.font = `${g.size}px ${TITLE_FONT_FAMILY}`
        ctx.strokeStyle = `rgba(180, 160, 255, ${0.04 + g.depth * 0.06})`
        ctx.strokeText(g.ch, 0, 0)
        ctx.restore()
    }
    ctx.textAlign = 'left'
}

function drawTickers(time) {
    const { left, right } = columnBounds()
    if (left < 70) return                         // no room on small screens

    ctx.font = '12px "IBM Plex Mono", monospace'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = 'rgba(255, 255, 255, 0.12)'
    const unit = ctx.measureText(TICKER).width
    const text = TICKER.repeat(Math.ceil((innerHeight * 2) / unit) + 2)
    const shift = wrap(scrollY * 0.6 + time * 0.02, unit)

    // left margin: reads bottom-to-top, moves up as you scroll
    ctx.save()
    ctx.translate(left / 2, innerHeight)
    ctx.rotate(-Math.PI / 2)
    ctx.fillText(text, -shift, 0)
    ctx.restore()

    // right margin: reads top-to-bottom, moves the other way
    ctx.save()
    ctx.translate(right + (innerWidth - right) / 2, 0)
    ctx.rotate(Math.PI / 2)
    ctx.fillText(text, shift - unit, 0)
    ctx.restore()
}

function drawBackground(time) {
    drawGhosts()
    drawDotGrid(time)
    drawTickers(time)
}
// ---------- animation loop ----------
function loop(time) {
    updateSerpent(time)
    updateTitle()
    updateParticles()

    ctx.clearRect(0, 0, innerWidth, innerHeight)
    drawBackground(time)             // behind everything, fixed to the screen
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