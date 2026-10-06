/** Compare selected XML documents; no requests, storage, or schema expansion. */
const XMLNS = 'http://www.w3.org/2000/xmlns/';
const PARSE_ERROR = 'http://www.mozilla.org/newlayout/xml/parsererror.xml';
const qualifiedName = node => node.namespaceURI ? `{${node.namespaceURI}}${node.localName}` : node.localName;
const meaningful = value => value.trim() ? value : '';

function parse(xml, label) {
  const document = new DOMParser().parseFromString(xml, 'application/xml');
  const error = document.getElementsByTagNameNS(PARSE_ERROR, 'parsererror')[0]
    || [...document.getElementsByTagNameNS('http://www.w3.org/1999/xhtml', 'parsererror')]
      .find(node => node.firstElementChild?.textContent === 'This page contains the following errors:');
  if (error || !document.documentElement) {
    throw new Error(`${label}: invalid XML. ${error?.textContent || 'No document element.'}`);
  }
  return document.documentElement;
}

function content(element) {
  const children = [];
  let text = '';
  for (const node of element.childNodes) {
    if (node.nodeType === Node.ELEMENT_NODE) children.push({element:node, tail:''});
    else if (node.nodeType === Node.TEXT_NODE || node.nodeType === Node.CDATA_SECTION_NODE) {
      if (children.length) children.at(-1).tail += node.nodeValue;
      else text += node.nodeValue;
    }
  }
  return {text, children};
}

function attributes(element) {
  return new Map([...element.attributes].filter(a => a.namespaceURI !== XMLNS)
    .map(a => [qualifiedName(a), a.value]));
}

export async function compareXml(first, second, labels = ['First file', 'Second file']) {
  const a = parse(first, labels[0]);
  const b = parse(second, labels[1]);
  const differences = [];
  const stack = [{a,b,path:`/${qualifiedName(a)}[1]`,at:'',bt:''}];
  const add = (path, kind, first, second) => differences.push({path,kind,first,second});
  let visited = 0;
  while (stack.length) {
    const {a,b,path,at,bt} = stack.pop();
    if (!a || !b) {
      const serializer = new XMLSerializer();
      add(path, a ? 'Removed' : 'Added', a ? serializer.serializeToString(a) : null,
        b ? serializer.serializeToString(b) : null);
      continue;
    }
    if (qualifiedName(a) !== qualifiedName(b)) add(path, 'Element name', qualifiedName(a), qualifiedName(b));
    const aa = attributes(a), ba = attributes(b);
    for (const key of [...new Set([...aa.keys(), ...ba.keys()])].sort()) {
      const av = aa.get(key) ?? null, bv = ba.get(key) ?? null;
      if (av !== bv) add(`${path}/@${key}`, 'Attribute', av, bv);
    }
    const ac = content(a), bc = content(b);
    if (meaningful(ac.text) !== meaningful(bc.text)) add(`${path}/text()`, 'Text', meaningful(ac.text), meaningful(bc.text));
    if (meaningful(at) !== meaningful(bt)) add(`${path}/tail()`, 'Text', meaningful(at), meaningful(bt));
    const children = [], counts = new Map();
    for (let i=0; i<Math.max(ac.children.length,bc.children.length); i++) {
      const ca = ac.children[i], cb = bc.children[i];
      const name = qualifiedName(ca?.element || cb.element);
      const index = (counts.get(name) || 0) + 1;
      counts.set(name,index);
      children.push({a:ca?.element,b:cb?.element,path:`${path}/${name}[${index}]`,at:ca?.tail || '',bt:cb?.tail || ''});
    }
    for (let i=children.length-1;i>=0;i--) stack.push(children[i]);
    if (++visited % 2000 === 0) await new Promise(resolve => setTimeout(resolve,0));
  }
  return differences;
}

export async function readSchemaFile(file) {
  if (!file || !/\.xsd$/i.test(file.name)) throw new Error('Select a file with the .xsd extension.');
  let bytes;
  try { bytes = new Uint8Array(await file.arrayBuffer()); }
  catch { throw new Error(`${file.name}: the file could not be read. Select it again.`); }
  let encoding = 'utf-8';
  if ((bytes[0] === 255 && bytes[1] === 254) || (bytes[0] === 60 && bytes[1] === 0)) encoding = 'utf-16le';
  else if ((bytes[0] === 254 && bytes[1] === 255) || (bytes[0] === 0 && bytes[1] === 60)) encoding = 'utf-16be';
  else {
    const declaration = new TextDecoder('ascii').decode(bytes.subarray(0,256));
    encoding = declaration.match(/^\s*(?:ï»¿)?<\?xml\s[^?]*encoding\s*=\s*['"]([^'"]+)['"]/i)?.[1] || encoding;
  }
  try { return new TextDecoder(encoding,{fatal:true}).decode(bytes); }
  catch { throw new Error(`${file.name}: cannot decode the file as ${encoding}. Use a supported XML encoding such as UTF-8 or UTF-16.`); }
}
