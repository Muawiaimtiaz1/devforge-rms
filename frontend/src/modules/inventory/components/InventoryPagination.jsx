export default function InventoryPagination({ pagination, onPageChange }) {
  if (!pagination || Number(pagination.total_pages || 1) <= 1) return null
  const page = Number(pagination.page || 1)
  const pages = Number(pagination.total_pages || 1)
  const from = ((page - 1) * Number(pagination.page_size || 20)) + 1
  const to = Math.min(page * Number(pagination.page_size || 20), Number(pagination.total || 0))
  return <div className="inventory-pagination"><span>Showing {from}-{to} of {Number(pagination.total || 0)}</span><div><button type="button" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>Previous</button><strong>{page} / {pages}</strong><button type="button" disabled={page >= pages} onClick={() => onPageChange(page + 1)}>Next</button></div></div>
}
