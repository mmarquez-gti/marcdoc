import { gzipSync } from 'node:zlib'
import { DOMParser, type Document } from '@xmldom/xmldom'
import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import { Package } from '../../src/core/docx/package'
import { copyRelationships } from '../../src/core/docx/parts'

const CT = 'http://schemas.openxmlformats.org/package/2006/content-types'
const RELS = 'http://schemas.openxmlformats.org/package/2006/relationships'
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const IMAGE_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image'
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20"/>'

function parse(xml: string): Document {
  return new DOMParser().parseFromString(xml, 'application/xml')
}

function contentTypes(entries = ''): Document {
  return parse(`<Types xmlns="${CT}">${entries}</Types>`)
}

function rels(entries = ''): Document {
  return parse(`<Relationships xmlns="${RELS}">${entries}</Relationships>`)
}

/** Pandoc's output with one image part, declared as Pandoc 3.1 declares it. */
async function pandocPackage(target: string, bytes: Uint8Array, declared: string) {
  const zip = new JSZip()
  zip.file('[Content_Types].xml', `<Types xmlns="${CT}">${declared}</Types>`)
  zip.file(`word/${target}`, bytes)
  return Package.load(await zip.generateAsync({ type: 'uint8array' }))
}

async function copyImage(target: string, bytes: Uint8Array, declared = '') {
  const source = await pandocPackage(target, bytes, declared)
  const template = await Package.load(await new JSZip().generateAsync({ type: 'uint8array' }))
  const templateRels = rels()
  const templateTypes = contentTypes()
  const block = parse(`<w:p xmlns:w="w" xmlns:r="${R}"><a r:embed="rId20"/></w:p>`)
  const idMap = await copyRelationships(
    source,
    template,
    rels(`<Relationship Id="rId20" Type="${IMAGE_REL}" Target="${target}"/>`),
    templateRels,
    templateTypes,
    [block.documentElement!],
  )
  const rel = templateRels.getElementsByTagNameNS(RELS, 'Relationship')[0]!
  const defaults = Array.from(templateTypes.getElementsByTagNameNS(CT, 'Default')).map((entry) => [
    entry.getAttribute('Extension'),
    entry.getAttribute('ContentType'),
  ])
  return { template, idMap, newTarget: rel.getAttribute('Target'), defaults }
}

const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes)

describe('copyRelationships with images', () => {
  it('copies an SVG that Pandoc stored as .svgz, by its declared content type', async () => {
    const declared = `<Override PartName="/word/media/rId20.svgz" ContentType="image/svg+xml"/>`

    const result = await copyImage('media/rId20.svgz', new TextEncoder().encode(SVG), declared)

    expect(result.idMap.get('rId20')).toBe('rIdMd1')
    expect(result.newTarget).toBe('media/marcdoc-rId20.svg')
    expect(result.defaults).toEqual([['svg', 'image/svg+xml']])
    expect(text(await result.template.readBinary('word/media/marcdoc-rId20.svg'))).toBe(SVG)
  })

  it('decompresses a gzip-compressed SVG, which Word cannot read', async () => {
    const declared = `<Override PartName="/word/media/rId20.svgz" ContentType="image/svg+xml"/>`

    const result = await copyImage('media/rId20.svgz', gzipSync(SVG), declared)

    expect(text(await result.template.readBinary('word/media/marcdoc-rId20.svg'))).toBe(SVG)
  })

  it('falls back to the extension when Pandoc declares no content type', async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47])

    const result = await copyImage('media/rId20.png', png)

    expect(result.newTarget).toBe('media/marcdoc-rId20.png')
    expect(result.defaults).toEqual([['png', 'image/png']])
    expect(await result.template.readBinary('word/media/marcdoc-rId20.png')).toEqual(png)
  })

  it('uses a Default content type declared by Pandoc for the extension', async () => {
    const declared = `<Default Extension="jpg" ContentType="image/jpeg"/>`

    const result = await copyImage('media/rId20.jpg', new Uint8Array([0xff, 0xd8]), declared)

    expect(result.newTarget).toBe('media/marcdoc-rId20.jpeg')
    expect(result.defaults).toEqual([['jpeg', 'image/jpeg']])
  })

  it('rejects an image type Word documents cannot hold', async () => {
    const declared = `<Override PartName="/word/media/rId20.xyz" ContentType="image/x-unknown"/>`

    await expect(copyImage('media/rId20.xyz', new Uint8Array([1]), declared)).rejects.toThrow(
      'Unsupported image type: media/rId20.xyz (image/x-unknown)',
    )
  })
})
