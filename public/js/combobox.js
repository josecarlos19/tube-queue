import { escapeHtml } from './dom.js';

const normalize = (value) => String(value).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function createCombobox(root, { onChange }) {
  root.innerHTML = `
    <button type="button" class="combobox-trigger" aria-haspopup="listbox" aria-expanded="false">
      <span class="combobox-value"></span>
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>
    </button>
    <div class="combobox-popover hidden">
      <div class="combobox-search">
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>
        <input type="text" role="combobox" aria-autocomplete="list" aria-expanded="true" autocomplete="off" spellcheck="false">
      </div>
      <ul class="combobox-list" role="listbox"></ul>
    </div>`;

  const trigger = root.querySelector('.combobox-trigger');
  const popover = root.querySelector('.combobox-popover');
  const search = root.querySelector('input');
  const list = root.querySelector('.combobox-list');
  const listId = `${root.id}-listbox`;
  list.id = listId;
  search.setAttribute('aria-controls', listId);

  let options = [];
  let labels = { empty: '', search: '' };
  let value = '';
  let visible = [];
  let activeIndex = 0;

  function renderValue() {
    const selected = options.find((option) => option.value === value) || options[0];
    root.querySelector('.combobox-value').innerHTML = selected
      ? `${selected.image ? `<img src="${escapeHtml(selected.image)}" alt="">` : ''}<span>${escapeHtml(selected.label)}</span>`
      : '';
  }

  function renderList() {
    const query = normalize(search.value.trim());
    visible = options.filter((option) => !query || normalize(option.label).includes(query));
    activeIndex = Math.min(activeIndex, Math.max(visible.length - 1, 0));
    if (!visible.length) {
      list.innerHTML = `<li class="combobox-empty">${escapeHtml(labels.empty)}</li>`;
      search.removeAttribute('aria-activedescendant');
      return;
    }
    list.innerHTML = visible.map((option, index) => `
      <li id="${listId}-${index}" role="option" class="combobox-option${index === activeIndex ? ' active' : ''}" aria-selected="${option.value === value}" data-index="${index}">
        ${option.image ? `<img src="${escapeHtml(option.image)}" alt="">` : '<span class="combobox-option-icon">≡</span>'}
        <span>${escapeHtml(option.label)}</span>
        ${option.value === value ? '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5 9-10"/></svg>' : ''}
      </li>`).join('');
    search.setAttribute('aria-activedescendant', `${listId}-${activeIndex}`);
    list.querySelector('.active')?.scrollIntoView({ block: 'nearest' });
  }

  function open() {
    popover.classList.remove('hidden');
    trigger.setAttribute('aria-expanded', 'true');
    search.value = '';
    activeIndex = Math.max(options.findIndex((option) => option.value === value), 0);
    renderList();
    search.focus();
  }

  function close({ focusTrigger = false } = {}) {
    popover.classList.add('hidden');
    trigger.setAttribute('aria-expanded', 'false');
    if (focusTrigger) {
      trigger.focus();
    }
  }

  function choose(option) {
    close({ focusTrigger: true });
    if (option && option.value !== value) {
      value = option.value;
      renderValue();
      onChange(value);
    }
  }

  trigger.addEventListener('click', () => (popover.classList.contains('hidden') ? open() : close()));
  search.addEventListener('input', () => {
    activeIndex = 0;
    renderList();
  });
  search.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      activeIndex = (activeIndex + step + visible.length) % Math.max(visible.length, 1);
      renderList();
    } else if (event.key === 'Enter') {
      event.preventDefault();
      choose(visible[activeIndex]);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      close({ focusTrigger: true });
    } else if (event.key === 'Tab') {
      close();
    }
  });
  list.addEventListener('mousedown', (event) => event.preventDefault());
  list.addEventListener('click', (event) => {
    const item = event.target.closest('[data-index]');
    if (item) {
      choose(visible[Number(item.dataset.index)]);
    }
  });
  list.addEventListener('mousemove', (event) => {
    const item = event.target.closest('[data-index]');
    if (item && Number(item.dataset.index) !== activeIndex) {
      activeIndex = Number(item.dataset.index);
      list.querySelectorAll('.combobox-option').forEach((node) => node.classList.toggle('active', node === item));
      search.setAttribute('aria-activedescendant', item.id);
    }
  });
  document.addEventListener('mousedown', (event) => {
    if (!root.contains(event.target)) {
      close();
    }
  });

  return {
    get value() {
      return value;
    },
    setOptions(nextOptions, nextLabels) {
      options = nextOptions;
      labels = nextLabels;
      if (!options.some((option) => option.value === value)) {
        value = options[0]?.value ?? '';
      }
      trigger.setAttribute('aria-label', labels.label);
      search.placeholder = labels.search;
      renderValue();
      if (!popover.classList.contains('hidden')) {
        renderList();
      }
    }
  };
}
