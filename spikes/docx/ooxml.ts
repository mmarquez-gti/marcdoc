// Minimal helpers to read and write parts of an OOXML package.
import { DOMParser, XMLSerializer, type Document, type Element, type Node } from '@xmldom/xmldom'
import JSZip from 'jszip'

export const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
export const R_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
export const PKG_RELS_NS = 'http://schemas.openxmlformats.org/package/2006/relationships'
export const CT_NS = 'http://schemas.openxmlformats.org/package/2006/content-types'
export const REL_TYPE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
export const WML_CT = 'application/vnd.openxmlformats-officedocument.wordprocessingml'

const XML_DECLARATION = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'

export class Package {
  private constructor(private readonly zip: JSZip) {}

  static async load(bytes: Uint8Array): Promise<Package> {
    return new Package(await JSZip.loadAsync(bytes))
  }

  has(path: string): boolean {
    return this.zip.file(path) !== null
  }

  async readXml(path: string): Promise<Document> {
    const file = this.zip.file(path)
    if (!file) throw new Error(`Missing package part: ${path}`)
    return new DOMParser().parseFromString(await file.async('string'), 'application/xml')
  }

  async readBinary(path: string): Promise<Uint8Array> {
    const file = this.zip.file(path)
    if (!file) throw new Error(`Missing package part: ${path}`)
    return file.async('uint8array')
  }

  writeXml(path: string, document: Document): void {
    const xml = new XMLSerializer().serializeToString(document).replace(/^<\?xml[^>]*\?>\s*/, '')
    this.zip.file(path, XML_DECLARATION + xml)
  }

  writeBinary(path: string, bytes: Uint8Array): void {
    this.zip.file(path, bytes)
  }

  paths(): string[] {
    return Object.keys(this.zip.files).filter((path) => !this.zip.files[path]!.dir)
  }

  generate(): Promise<Uint8Array> {
    return this.zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })
  }
}

export function elements(parent: Node, namespace: string, localName: string): Element[] {
  const result: Element[] = []
  for (let child = parent.firstChild; child; child = child.nextSibling) {
    if (isElement(child) && child.namespaceURI === namespace && child.localName === localName) {
      result.push(child)
    }
  }
  return result
}

export function descendants(
  root: Document | Element,
  namespace: string,
  localName: string,
): Element[] {
  return Array.from(root.getElementsByTagNameNS(namespace, localName))
}

export function isElement(node: Node): node is Element {
  return node.nodeType === node.ELEMENT_NODE
}

export function childElements(parent: Node): Element[] {
  const result: Element[] = []
  for (let child = parent.firstChild; child; child = child.nextSibling) {
    if (isElement(child)) result.push(child)
  }
  return result
}

export function wAttr(element: Element, name: string): string | null {
  return element.getAttributeNS(W_NS, name)
}

/** Directory of a package part, e.g. `word/` for `word/document.xml`. */
export function partDir(path: string): string {
  return path.slice(0, path.lastIndexOf('/') + 1)
}

export function relsPathOf(partPath: string): string {
  const slash = partPath.lastIndexOf('/')
  return `${partPath.slice(0, slash + 1)}_rels/${partPath.slice(slash + 1)}.rels`
}
