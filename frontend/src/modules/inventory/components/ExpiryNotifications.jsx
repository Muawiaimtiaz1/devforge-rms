import { number } from '../inventory.utils'

export default function ExpiryNotifications({ warnings }) {
  if (!warnings.length) return null
  return <section className="expiry-notifications" role="status" aria-live="polite"><h2>Expiry notifications</h2>{warnings.map((item) => <p className={item.daysLeft < 0 ? 'expired' : ''} key={item.id}>{number(item.quantity)} {item.unit} of {item.name} {item.daysLeft < 0 ? `expired ${Math.abs(item.daysLeft)} day${Math.abs(item.daysLeft) === 1 ? '' : 's'} ago` : item.daysLeft === 0 ? 'expires today' : `is near expiry (${item.daysLeft} day${item.daysLeft === 1 ? '' : 's'} left)`}.</p>)}</section>
}
