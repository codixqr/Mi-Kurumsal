import sys
pages = ['projects', 'contracts', 'tasks']

for page in pages:
    path = f'app/(dashboard)/{page}/page.jsx'
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    if 'let hasFilters = false;' not in content:
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
        try { setFilterDraft(newFilters); } catch(e) {}
      }
    }
  }, []);\n\n'''
        
        if 'useEffect(() => { fetchData(); }, [fetchData]);' in content:
            content = content.replace('useEffect(() => { fetchData(); }, [fetchData]);', insert_str + '  useEffect(() => { fetchData(); }, [fetchData]);')
        elif 'useEffect(() => { fetchList(); }, [fetchList]);' in content:
            content = content.replace('useEffect(() => { fetchList(); }, [fetchList]);', insert_str + '  useEffect(() => { fetchList(); }, [fetchList]);')
            
        with open(path, 'w', encoding='utf-8') as f:
            f.write(content)
