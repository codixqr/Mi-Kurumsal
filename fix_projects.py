import sys

pages = ['projects', 'contracts', 'tasks']

insert_str = '''  useEffect(() => {
    if (typeof window !== 'undefined') {
      const sp = new URLSearchParams(window.location.search);
      let hasFilters = false;
      const newFilters = { ...defaultFilters() };
      const d = defaultFilters();
      for (const key of Object.keys(d)) {
        if (sp.has(key)) {
          newFilters[key] = sp.get(key);
          hasFilters = true;
        }
      }
      if (hasFilters) {
        setFilters(newFilters);
        setFilterDraft(newFilters);
      }
    }
  }, []);

  useEffect(() => {
    fetchData();'''

search_str = '''  useEffect(() => {
    fetchData();'''

for page in pages:
    path = f'app/(dashboard)/{page}/page.jsx'
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    if 'let hasFilters = false;' not in content:
        content = content.replace(search_str, insert_str)
        with open(path, 'w', encoding='utf-8') as f:
            f.write(content)
