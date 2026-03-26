const slug = 'hww63u'
const url = `http://localhost:4321/product/${slug}`

const res = await fetch(url)
const html = await res.text()

const hasMetaDesc = html.includes('name="description"') && html.includes('content="')
let titleText = ''
const titleStart = html.indexOf('<title>')
const titleEnd = titleStart >= 0 ? html.indexOf('</title>', titleStart) : -1
if (titleStart >= 0 && titleEnd > titleStart) titleText = html.slice(titleStart + '<title>'.length, titleEnd)

const descIdx = html.indexOf('name="description"')
let descLen = 0
if (descIdx >= 0) {
  const contentIdx = html.indexOf('content="', descIdx)
  if (contentIdx >= 0) {
    const start = contentIdx + 'content="'.length
    const end = html.indexOf('"', start)
    descLen = end > start ? html.slice(start, end).length : 0
  }
}

console.log(JSON.stringify({ url, status: res.status, hasMetaDesc, titleText, descLen }))

