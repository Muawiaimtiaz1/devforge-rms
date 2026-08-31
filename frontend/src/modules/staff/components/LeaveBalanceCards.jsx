export default function LeaveBalanceCards({ data }) {
  if (!data) return <div className="access-empty">Select a staff member to view balances.</div>
  return <section className="leave-balances"><header><div><h3>Leave balances</h3><p>{data.staff.full_name}</p></div></header><div>{data.balances.map((balance) => <article key={balance.id}><span>{balance.name}</span><strong>{Number(balance.available_days).toFixed(2)}</strong><small>days available · {String(balance.period_start).slice(0,10)}–{String(balance.period_end).slice(0,10)}</small></article>)}{!data.balances.length && <div className="access-empty">No balance periods allocated.</div>}</div></section>
}
