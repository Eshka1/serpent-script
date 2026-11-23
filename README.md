🐍 serpent-script

A glowing serpent slithers through a page of text, and every line reflows around its body in real time. Scroll and it weaves down the page. Move your mouse and it chases you. Paste your own words and it moves through those too.

Built with plain JavaScript, HTML canvas and Pretext. No framework, no build step and nothing to install.

▶ Live demo: https://eshka1.github.io/serpent-script/

<!-- Add a screen recording here: ![serpent-script demo](assets/preview.gif) -->
✨ Features
Live text reflow: every line wraps around the serpent's curving body, every frame, without losing a word
Scroll-driven motion: the serpent weaves down the page as you scroll, and sways gently when you stop
Cursor follow: move your mouse and it comes to find you. Scroll again and it goes back to its path.
Springy title: the big outlined title's letters scatter when the serpent hits them, then spring back into place
Glyph particles: letters break off the serpent's head and drift away
Your own text: paste any title and up to 4,000 characters, and the serpent moves through your words. It works with any language, including Bangla and emoji.
Animated background: drifting aurora colours, a dot grid that ripples around the head, floating ghost glyphs with parallax, vertical tickers in the margins, plus film grain and a vignette
No DOM reflow: text is measured once, then laid out with plain arithmetic
🧠 How it works

Normally, if text has to wrap around a moving shape, the browser re-measures the page every frame (a "reflow"), which is slow. Pretext avoids that by splitting the work into two steps:

Prepare (once): prepareWithSegments(text, font) measures every word with the browser's own font engine and caches the widths.
Lay out (every frame): for each row of text, the code works out where the serpent's body crosses that row. That leaves one, two or three free gaps, and layoutNextLine(prepared, gapWidth, cursor) fills each gap with as many words as fit. The returned cursor tells the next gap exactly where to continue.
js
import { prepareWithSegments, layoutNextLine } from 'https://cdn.jsdelivr.net/npm/@chenglou/pretext@1.0.0/dist/layout.js'

const prepared = prepareWithSegments(text, '15px "IBM Plex Mono", monospace')
let cursor = { segmentIndex: 0, graphemeIndex: 0 }

for (const gap of freeGapsInThisRow) {
  const line = layoutNextLine(prepared, gap.width, cursor)
  if (!line) break                   // ran out of text
  ctx.fillText(line.text, gap.x, y)  // draw it on the canvas
  cursor = line.end                  // continue from here in the next gap
}
The pieces
Part	Idea
Serpent body	A chain of circles. The head eases towards a target, and each circle stays a fixed distance behind the one in front (follow-the-leader).
Free gaps	Each circle blocks part of a row (worked out with Pythagoras). The blocked parts are sorted and merged, and whatever is left becomes gaps.
Scrolling	The canvas is fixed to the screen. An invisible spacer gives the page its height, and everything is drawn shifted up by scrollY.
Title letters	Each letter is a small spring: it's pulled home, pushed away by nearby segments and slowed by friction.
Particles	The faster the head moves, the more letters it sheds. Each one drifts, floats up and fades out.
Background	CSS aurora and grain layers around the canvas. The dots and ghost glyphs move at different scroll speeds (parallax) to create depth.
Speed	Only visible rows are painted, layout stops below the screen, and only the dots near the head get the expensive glow maths.
📚 Concepts covered
Measuring and wrapping text in JavaScript with Pretext
Flowing text around shapes that move
Scroll-driven animation and parallax
Canvas rendering with requestAnimationFrame and high-DPI screens
Follow-the-leader and spring physics
Particle systems
Layered CSS effects (gradients, blur, SVG noise)
🚀 Run it locally

ES modules don't load from file://, so you need a small local server:

bash
git clone https://github.com/Eshka1/serpent-script.git
cd serpent-script

# pick one
python -m http.server 8000
npx serve .

Then open http://localhost:8000.

In VS Code, right-click index.html and choose Open with Live Server.

🌐 Deploy on GitHub Pages
Push the repo to GitHub.
Go to Settings → Pages.
Under Source, choose Deploy from a branch, then pick main and / (root).
Click Save. After a minute or two the site appears at https://<your-username>.github.io/serpent-script/.
📁 Project structure
serpent-script/
├── index.html    # page shell, fonts, canvas and the "use your own text" panel
├── style.css     # dark theme, editor panel, aurora, grain and vignette
├── main.js       # text layout, serpent, title, particles, background and render loop
└── README.md

Pretext is loaded straight from the jsDelivr CDN, so there's nothing to install.

🛠️ Customise

All the settings are constants near the top of each section in main.js:

Want to change…	Edit
The default text	DEFAULT_PARAGRAPHS
The default title	DEFAULT_TITLE
Font and spacing	FONT, LINE_HEIGHT, PARAGRAPH_GAP
Serpent size and length	SEGMENTS, HEAD_RADIUS, TAIL_RADIUS, SPACING
Character limit for visitors	MAX_CHARS (and maxlength in index.html)
Dot grid density and glow	GRID, GLOW_RADIUS
Margin ticker text	TICKER
Background colours	the rgba(...) gradients in body::before in style.css

If you switch to another web font, add it to the Google Fonts link in index.html too.

🔒 Privacy

Text that visitors type into the panel stays in their own browser. It isn't saved or sent anywhere, and it's gone when the page is refreshed.

🗺️ Ideas for later
[ ] Touch support so the serpent follows your finger on phones
[ ] Shareable links that store a visitor's text in the URL
[ ] Colour themes (fire, ocean, neon)
🙏 Credits
Pretext by Cheng Lou and contributors (MIT). It does the text measurement and line breaking.
Fonts: IBM Plex Mono and Playfair Display from Google Fonts.
Inspired by the demos at chenglou.me/pretext.
📄 License

MIT. Feel free to use it in your own portfolio.