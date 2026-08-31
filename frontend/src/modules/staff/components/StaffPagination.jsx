export default function StaffPagination({ page, pages, onPageChange }) {
  if (pages <= 1) return null
  return <nav className="staff-pagination" aria-label="Staff pages"><button className="secondary-button" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>Previous</button><span>Page {page} of {pages}</span><button className="secondary-button" disabled={page >= pages} onClick={() => onPageChange(page + 1)}>Next</button></nav>
}
