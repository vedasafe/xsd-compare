import {compareXml, readSchemaFile} from './compare.js';

const inputs = [document.querySelector('#first-file'),document.querySelector('#second-file')];
const compareButton = document.querySelector('#compare');
const status = document.querySelector('#selection-status');
const results = document.querySelector('#results-body');
const section = document.querySelector('.results-section');
const files = [null,null];
let busy = false;

function element(tag,text,className) {
  const node = document.createElement(tag);
  node.textContent = text;
  if (className) node.className = className;
  return node;
}

function showState(kind,title,description) {
  results.className = `results-body ${kind}`;
  results.replaceChildren(element('h3',title),element('p',description));
}

inputs.forEach((input,index) => input.addEventListener('change', () => {
  const file = input.files[0];
  if (!file) return;
  const valid = /\.xsd$/i.test(file.name);
  files[index] = valid ? file : null;
  const prefix = index === 0 ? 'first' : 'second';
  document.querySelector(`#${prefix}-name`).textContent = valid ? file.name : 'Choose an XSD file';
  document.querySelector(`#${prefix}-meta`).textContent = valid ? `${new Intl.NumberFormat().format(file.size)} bytes · Ready` : '.xsd files only';
  showState('empty','Your comparison will appear here','Select two files, then compare.');
  compareButton.disabled = !files.every(Boolean);
  status.textContent = valid ? (files.every(Boolean) ? 'Ready to compare' : 'Select the other XSD file') : 'Select a file with the .xsd extension.';
}));

compareButton.addEventListener('click', async () => {
  if (busy || !files.every(Boolean)) return;
  busy = true;
  compareButton.disabled = true;
  inputs.forEach(input => input.disabled = true);
  section.setAttribute('aria-busy','true');
  status.textContent = 'Comparing…';
  showState('empty','Comparing your files…','Your files stay on this device.');
  try {
    const [first,second] = await Promise.all(files.map(readSchemaFile));
    const differences = await compareXml(first,second,files.map(file => file.name));
    if (!differences.length) {
      showState('same','Same','No differences under the comparison rules. Indentation and blank lines were ignored.');
      status.textContent = 'Comparison complete: same';
    } else {
      const title = `${differences.length} difference${differences.length === 1 ? '' : 's'} found`;
      showState('different',title,'First and second values are shown below. Quoted values preserve visible spaces.');
      const fragment = document.createDocumentFragment();
      for (const [index,diff] of differences.slice(0,500).entries()) {
        const row = element('article','','difference');
        row.append(element('h4',`${index+1}. ${diff.kind}`),element('code',diff.path,'difference-path'));
        const values = element('div','','value-grid');
        for (const [label,value] of [['First file',diff.first],['Second file',diff.second]]) {
          const cell = element('div','','value');
          cell.append(element('span',label,'value-label'),element('pre',value === null ? '(missing)' : JSON.stringify(value)));
          values.append(cell);
        }
        row.append(values);
        fragment.append(row);
      }
      results.append(fragment);
      if (differences.length > 500) results.append(element('p',`Showing the first 500 of ${differences.length} differences. Use the desktop application to view all differences.`));
      status.textContent = `Comparison complete: ${title}`;
    }
  } catch (error) {
    showState('error','Could not compare',error.message);
    status.textContent = 'Comparison failed. Check the message below.';
  } finally {
    busy = false;
    compareButton.disabled = !files.every(Boolean);
    inputs.forEach(input => input.disabled = false);
    section.setAttribute('aria-busy','false');
  }
});
