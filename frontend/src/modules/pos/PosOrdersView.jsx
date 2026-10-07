import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, Pencil, Printer, RefreshCw } from 'lucide-react'
import { api } from '../../api/client'
import { formatShopCurrency as money } from '../../currency'
import { configuredItemName, parseList } from './pos.logic'
import PosPaymentModal from './PosPaymentModal'
import PosDeliveryEditor from './PosDeliveryEditor'

const can=(user,key)=>user?.role==='superadmin'||user?.permissions?.includes(key)
const TYPES=['dine_in','takeaway','delivery','walk_in']

export default function PosOrdersView({user,back,notify,printReceipt,onEdit}){
  const [orders,setOrders]=useState([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[search,setSearch]=useState(''),[type,setType]=useState(''),[view,setView]=useState(()=>localStorage.getItem('orders_view')==='table'?'table':'cards'),[details,setDetails]=useState(null),[payment,setPayment]=useState(null)
  const [realtime,setRealtime]=useState('reconnecting')
  const loaded=useRef(false)
  const load=useCallback(async()=>{try{setLoading(true);setError('');const rows=await api('/api/sales');setOrders((Array.isArray(rows)?rows:[]).filter(row=>row.order_status!=='completed').slice(0,50))}catch(requestError){setError(requestError.message)}finally{setLoading(false)}},[])
  useEffect(()=>{
    let active=true,refreshTimer=null,staleWhileHidden=false,socket=null
    const scheduleRefresh=()=>{if(document.hidden){staleWhileHidden=true;return}clearTimeout(refreshTimer);refreshTimer=setTimeout(load,250)}
    const statusLive=()=>setRealtime('live')
    const statusDisconnect=reason=>setRealtime(reason==='io server disconnect'?'offline':'reconnecting')
    const statusError=event=>setRealtime(event?.data?.code==='UNAUTHORIZED'?'offline':'reconnecting')
    const subscribe=instance=>{if(!active)return;socket=instance;socket.on('connect',statusLive);socket.on('realtime:ready',scheduleRefresh);socket.on('order:changed',scheduleRefresh);socket.on('disconnect',statusDisconnect);socket.on('connect_error',statusError);setRealtime(socket.connected?'live':'reconnecting')}
    const getSocket=()=>new Promise((resolve,reject)=>{
      if(window.orderRealtimeSocket)return resolve(window.orderRealtimeSocket)
      const connect=()=>{if(!window.orderRealtimeSocket)window.orderRealtimeSocket=window.io({path:'/socket.io',withCredentials:true});resolve(window.orderRealtimeSocket)}
      if(typeof window.io==='function')return connect()
      const existing=document.querySelector('script[data-order-realtime-client]')
      if(existing){existing.addEventListener('load',connect,{once:true});existing.addEventListener('error',reject,{once:true});return}
      const script=document.createElement('script');script.src='/socket.io/socket.io.js';script.dataset.orderRealtimeClient='true';script.onload=connect;script.onerror=reject;document.head.appendChild(script)
    })
    const initial=setTimeout(()=>{if(!loaded.current){loaded.current=true;load()}},0)
    const fallback=setInterval(()=>{if(!document.hidden&&!socket?.connected)load()},300000)
    const visible=()=>{if(!document.hidden&&staleWhileHidden){staleWhileHidden=false;scheduleRefresh()}}
    document.addEventListener('visibilitychange',visible)
    getSocket().then(subscribe).catch(()=>{if(active)setRealtime('offline')})
    return()=>{active=false;clearTimeout(initial);clearTimeout(refreshTimer);clearInterval(fallback);document.removeEventListener('visibilitychange',visible);if(socket){socket.off('connect',statusLive);socket.off('realtime:ready',scheduleRefresh);socket.off('order:changed',scheduleRefresh);socket.off('disconnect',statusDisconnect);socket.off('connect_error',statusError)}}
  },[load])
  const filtered=orders.filter(row=>(!type||row.order_type===type)&&(!search||String(row.order_number||row.id).includes(search)))
  const canServe=order=>['dine_in','takeaway'].includes(order.order_type)&&order.order_status==='ready'&&(Number(order.user_id)===Number(user.id)||Number(order.waiter_id)===Number(user.id)||user.role==='receptionist')
  const primaryAction=order=>canServe(order)?<button onClick={()=>served(order)}>{order.order_type==='takeaway'?'Handed Over':'Served'}</button>:can(user,'orders.take_payment')&&can(user,'orders.complete')?<button onClick={()=>setPayment(order)}>Pay</button>:can(user,'orders.complete')?<button onClick={()=>complete(order)}>Complete</button>:null
  function chooseView(value){setView(value);localStorage.setItem('orders_view',value)}
  async function showDetails(id){try{setDetails(await api(`/api/sales/${id}/bill`))}catch(requestError){notify(requestError.message,'error')}}
  async function complete(order){if(!confirm('Are you sure you want to complete this order and move it to sales history?'))return;try{if(order.order_type==='walk_in')await api('/api/sales/'+order.id+'/complete',{method:'POST',body:{}});else await api('/api/kds/'+order.id+'/status',{method:'PATCH',body:{status:'completed'}});notify('Order completed');load()}catch(requestError){notify(requestError.message,'error')}}
  async function served(order){try{await api(`/api/kds/${order.id}/status`,{method:'PATCH',body:{status:'served'}});notify(order.order_type==='takeaway'?'Order handed over':'Order served');load()}catch(requestError){notify(requestError.message,'error')}}
  return <main className="pos-orders"><header><button onClick={back}><ArrowLeft size={17}/> Back</button><span><h1>Active Orders</h1><p>Dine-in, takeaway, delivery, and saved retail orders</p><small data-realtime-status={realtime}><i/> {realtime==='live'?'Live':realtime==='offline'?'Offline':'Reconnecting'}</small></span><button onClick={load}><RefreshCw size={16}/> Refresh</button></header><nav><input value={search} onChange={event=>setSearch(event.target.value)} placeholder="Search Order ID..."/><select value={type} onChange={event=>setType(event.target.value)}><option value="">All Types</option>{TYPES.map(value=><option value={value} key={value}>{value.replaceAll('_',' ')}</option>)}</select><button className={view==='cards'?'active':''} onClick={()=>chooseView('cards')}>Mobile</button><button className={view==='table'?'active':''} onClick={()=>chooseView('table')}>Table</button></nav>{error&&<div className="pos-error">{error}</div>}{loading?<div className="orders-empty">Loading active orders...</div>:!filtered.length?<div className="orders-empty">No active orders found</div>:view==='cards'?<section className="order-cards">{filtered.map(order=><article key={order.id}><header><span><small>Order #{order.order_number||order.id}</small><b>{order.order_type==='dine_in'?`Table ${order.table_number||'N/A'}`:order.customer_name||order.delivery_address||'Counter order'}</b></span><em>{String(order.order_status||'pending').replaceAll('_',' ')}</em></header><dl><div><dt>Service</dt><dd>{order.order_type.replaceAll('_',' ')}</dd></div><div><dt>Waiter</dt><dd>{order.waiter_name||'-'}</dd></div><div><dt>Total</dt><dd>{money(order.total)}</dd></div></dl><footer>{can(user,'orders.view')&&<button onClick={()=>showDetails(order.id)}>Details</button>}{can(user,'orders.update')&&<button onClick={()=>onEdit(order.id)}><Pencil size={14}/> Edit</button>}{can(user,'orders.view')&&<button onClick={()=>printReceipt(order.id,'customer')}><Printer size={14}/> Print</button>}{primaryAction(order)}</footer></article>)}</section>:<div className="orders-table"><table><thead><tr><th>Order</th><th>Type</th><th>Details</th><th>Waiter</th><th>Status</th><th>Total</th><th>Actions</th></tr></thead><tbody>{filtered.map(order=><tr key={order.id}><td>#{order.order_number||order.id}</td><td>{order.order_type.replaceAll('_',' ')}</td><td>{order.table_number?`Table ${order.table_number}`:order.customer_name||'-'}</td><td>{order.waiter_name||'-'}</td><td>{order.order_status}</td><td>{money(order.total)}</td><td><button onClick={()=>showDetails(order.id)}>View</button>{can(user,'orders.update')&&<button onClick={()=>onEdit(order.id)}>Edit</button>}<button onClick={()=>printReceipt(order.id,'customer')}>Print</button>{primaryAction(order)}</td></tr>)}</tbody></table></div>}{details&&<div className="pos-modal-bg" onMouseDown={event=>event.target===event.currentTarget&&setDetails(null)}><section className="pos-modal"><header><h3>Order #{details.sale?.order_number||details.sale?.id}</h3><button onClick={()=>setDetails(null)}>×</button></header><div className="order-details">{details.sale?.order_type==='delivery'&&<PosDeliveryEditor sale={details.sale} canEdit={can(user,'orders.update')} notify={notify} onDone={()=>{setDetails(null);load()}}/>}{(details.items||[]).map(item=><div key={item.id}><span><b>{configuredItemName({name:item.product_name,variants:parseList(item.variants_json),addons:parseList(item.addons_json)})}</b>{item.special_instructions&&<small>{item.special_instructions}</small>}</span><strong>{item.quantity} × {money(item.price_at_sale)}</strong></div>)}<footer><b>Total</b><strong>{money(details.sale?.total)}</strong></footer></div></section></div>}{payment&&<PosPaymentModal order={payment} close={()=>setPayment(null)} notify={notify} onDone={load} printReceipt={printReceipt}/>}</main>
}
