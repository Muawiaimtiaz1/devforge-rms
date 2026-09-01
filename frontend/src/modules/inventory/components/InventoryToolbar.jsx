const TABS = [['all', 'All Inventory'], ['ingredients', 'Raw Ingredients'], ['stock', 'Stock Products']]

export default function InventoryToolbar({ active, search, onTabChange, onSearchChange }) {
  return <div className="inventory-toolbar"><div className="inventory-tabs" role="group" aria-label="Inventory type filter">{TABS.map(([id, label]) => <button type="button" className={active === id ? 'active' : ''} key={id} onClick={() => onTabChange(id)}>{label}</button>)}</div><label className="inventory-search"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 21l-4.35-4.35m2.35-5.65a8 8 0 11-16 0 8 8 0 0116 0z" /></svg><input aria-label="Search inventory" value={search} onChange={(event) => onSearchChange(event.target.value)} placeholder="Search ingredient, product, variant, SKU…" /></label></div>
}
