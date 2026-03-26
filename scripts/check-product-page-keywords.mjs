const slug = 'hww63u'
const url = `http://localhost:4321/product/${slug}`

const res = await fetch(url)
const html = await res.text()

const idx = html.indexOf('name="keywords"')
let content = ''
if (idx >= 0) {
  const cIdx = html.indexOf('content="', idx)
  if (cIdx >= 0) {
    const start = cIdx + 'content="'.length
    const end = html.indexOf('"', start)
    content = end > start ? html.slice(start, end) : ''
  }
}

console.log(JSON.stringify({ url, status: res.status, found: idx >= 0, keywords: content.slice(0, 120) }))

