import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from '../../../api/client'

function routesFor(category) {
  if (Array.isArray(category?.route_targets)) return category.route_targets
  try {
    const parsed = JSON.parse(category?.route_targets || '[]')
    if (Array.isArray(parsed)) return parsed
  } catch { /* Legacy rows may contain a plain printer route. */ }
  return category?.printer_station ? [category.printer_station] : []
}

export default function ProductCategoriesView({ canCreate, canUpdate, canDelete, onBack, notify }) {
  const [categories, setCategories] = useState([])
  const [printers, setPrinters] = useState([])
  const [kitchens, setKitchens] = useState([])
  const [name, setName] = useState('')
  const [targets, setTargets] = useState([])
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const [categoryRows, printerRows, userRows] = await Promise.all([
        api('/api/product-categories'),
        api('/api/printers').catch(() => []),
        api('/api/users').catch(() => []),
      ])
      setCategories(Array.isArray(categoryRows) ? categoryRows : [])
      setPrinters(Array.isArray(printerRows) ? printerRows : [])
      setKitchens((Array.isArray(userRows) ? userRows : []).filter((user) => user.role === 'kitchen'))
    } catch (requestError) { setError(requestError.message) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(load, 0)
    return () => window.clearTimeout(timer)
  }, [load])
  const visible = useMemo(() => categories.filter((category) => String(category.name || '').toLowerCase().includes(search.trim().toLowerCase())), [categories, search])
  const totalLinked = categories.reduce((sum, category) => sum + Number(category.product_count || 0), 0)
  const routeLabel = (route) => {
    if (String(route).startsWith('PRINTER:')) {
      const printer = printers.find((item) => Number(item.id) === Number(String(route).slice(8)))
      return printer ? `Printer: ${printer.display_name}` : route
    }
    if (String(route).startsWith('KITCHEN:')) {
      const kitchen = kitchens.find((item) => Number(item.id) === Number(String(route).slice(8)))
      return kitchen ? `Kitchen: ${kitchen.name || kitchen.username}` : route
    }
    return route
  }
  const toggleTarget = (target) => setTargets((current) => current.includes(target) ? current.filter((item) => item !== target) : [...current, target])

  async function createCategory(event) {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return setError('Category name is required.')
    setBusy(true); setError('')
    try {
      await api('/api/product-categories', { method: 'POST', body: { name: trimmed, route_targets: targets } })
      setName(''); setTargets([]); notify('Category added successfully')
      await load()
    } catch (requestError) { setError(requestError.message) }
    finally { setBusy(false) }
  }

  async function editCategory(category) {
    const nextName = window.prompt('Enter the new category name:', category.name || '')
    if (nextName === null || !nextName.trim() || nextName.trim() === category.name) return
    try {
      await api(`/api/product-categories/${category.id}`, { method: 'PATCH', body: { name: nextName.trim() } })
      notify('Category updated'); await load()
    } catch (requestError) { setError(requestError.message) }
  }

  async function removeCategories(ids) {
    if (!ids.length || !window.confirm(`Delete ${ids.length} categor${ids.length === 1 ? 'y' : 'ies'}? Linked products will be left uncategorized.`)) return
    setBusy(true); setError('')
    let deleted = 0
    for (const id of ids) {
      try { await api(`/api/product-categories/${id}`, { method: 'DELETE' }); deleted += 1 }
      catch (requestError) { setError(requestError.message) }
    }
    if (deleted) notify(`${deleted} categor${deleted === 1 ? 'y' : 'ies'} deleted`)
    setSelected([]); setBusy(false); await load()
  }

  return <section className="inventory-categories">
    <header className="inventory-category-heading"><div><button type="button" onClick={onBack}>← Back to Inventory</button><small>Inventory setup</small><h1>Product Categories</h1><p>Create categories, manage routing, and see how many products use each category.</p></div><div className="inventory-category-stats"><span><small>Categories</small><b>{categories.length}</b></span><span><small>Linked products</small><b>{totalLinked}</b></span></div></header>
    {error && <div className="inventory-page-error"><span>{error}</span><button type="button" onClick={() => setError('')}>×</button></div>}
    {canCreate && <form className="inventory-category-create" onSubmit={createCategory}><div><label htmlFor="inventory-category-name">New category name</label><input id="inventory-category-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Main Course" /></div><button className="inventory-primary" disabled={busy}>Add Category</button><details><summary>Optional kitchen and printer routes</summary><div className="inventory-category-routes">{printers.map((printer) => { const value = `PRINTER:${printer.id}`; return <label key={value}><input type="checkbox" checked={targets.includes(value)} onChange={() => toggleTarget(value)} /> Printer: {printer.display_name}</label> })}{kitchens.map((kitchen) => { const value = `KITCHEN:${kitchen.id}`; return <label key={value}><input type="checkbox" checked={targets.includes(value)} onChange={() => toggleTarget(value)} /> Kitchen: {kitchen.name || kitchen.username}</label> })}{!printers.length && !kitchens.length && <p>No printer or kitchen routes available.</p>}</div></details></form>}
    <section className="inventory-category-list"><header><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search categories…" />{canDelete && selected.length > 0 && <button type="button" disabled={busy} onClick={() => removeCategories(selected)}>Delete selected ({selected.length})</button>}</header>{loading ? <div className="inventory-content-loader"><span />Loading categories…</div> : <div className="inventory-category-table"><table><thead><tr><th><input type="checkbox" aria-label="Select all categories" checked={visible.length > 0 && visible.every((category) => selected.includes(category.id))} onChange={(event) => setSelected(event.target.checked ? [...new Set([...selected, ...visible.map((category) => category.id)])] : selected.filter((id) => !visible.some((category) => category.id === id)))} /></th><th>Category</th><th>Linked products</th><th>Print route</th><th>Actions</th></tr></thead><tbody>{visible.map((category) => <tr key={category.id}><td><input type="checkbox" checked={selected.includes(category.id)} onChange={() => setSelected((current) => current.includes(category.id) ? current.filter((id) => id !== category.id) : [...current, category.id])} /></td><td><b>{category.name}</b></td><td><span>{Number(category.product_count || 0)}</span></td><td>{routesFor(category).length ? routesFor(category).map(routeLabel).join(', ') : 'No route assigned'}</td><td><div>{canUpdate && <button type="button" onClick={() => editCategory(category)}>Edit</button>}{canDelete && <button type="button" className="danger" onClick={() => removeCategories([category.id])}>Delete</button>}</div></td></tr>)}</tbody></table>{!visible.length && <p className="inventory-empty">No matching categories found.</p>}</div>}</section>
  </section>
}
