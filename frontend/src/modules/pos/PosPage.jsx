import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, ChefHat, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Circle, ClipboardList, Image as ImageIcon, PackageOpen, PartyPopper, Plus, ShoppingCart, Truck, Utensils, X } from 'lucide-react'
import { api, legacyUrl } from '../../api/client'
import { formatShopCurrency as money } from '../../currency'
import PosOrdersView from './PosOrdersView'
import PosTableSelection from './PosTableSelection'
import { cartItemStock as itemStock, cartSelectionKey as itemSelectionKey, configuredItemName, isRecipeProduct as isRecipe, isRetailOrder, menuStock as productStock, menuVariants, normalizedNote, parseList, saleItemPayload } from './pos.logic'
import './pos.generated.css'

const emptyForm = { table_id:'', waiter_id:'', rider_id:'', delivery_address:'', token_number:'', discount:'', tax_percentage:'', payment_method:'cash', amount_received:'', customer_name:'', customer_phone:'', customer_id:null, quotation:false, money_received:false }
const can = (user, key) => user?.role === 'superadmin' || user?.permissions?.includes(key)
const KITCHEN_NOTES=['No salt','Less spicy','Extra spicy','No onion','No garlic','Well done','Pack separately']
const ORDER_TYPES = [
  { id:'walk_in', Icon:ShoppingCart, label:'Walk-in', description:'Retail counter order saved before payment' },
  { id:'dine_in', Icon:Utensils, label:'Dine-in', description:'Table, waiter, and kitchen service' },
  { id:'takeaway', Icon:PackageOpen, label:'Takeaway', description:'Counter pickup and token service' },
  { id:'delivery', Icon:Truck, label:'Delivery', description:'Customer address and rider service' }
]

function Modal({ title, close, children }) {
  useEffect(() => { const handler = event => event.key === 'Escape' && close(); addEventListener('keydown', handler); return () => removeEventListener('keydown', handler) }, [close])
  return <div className="pos-modal-bg" onMouseDown={event => event.target === event.currentTarget && close()}><section className="pos-modal" role="dialog" aria-modal="true"><header><h3>{title}</h3><button onClick={close} aria-label="Close"><X size={20}/></button></header>{children}</section></div>
}

function ProductOptions({ product, close, add, notify }) {
  const variants = menuVariants(product)
  const recipe = isRecipe(product)
  const addons = recipe ? parseList(product.addons) : []
  const defaultVariant = recipe ? variants.find(item => item.is_default) || variants[0] : variants.find(item => item.is_default && Number(item.stock) > 0) || variants.find(item => Number(item.stock) > 0) || null
  const [variant, setVariant] = useState(defaultVariant)
  const [addonQty, setAddonQty] = useState({})
  const [quantity, setQuantity] = useState(1)
  const [note, setNote] = useState('')
  const [componentProducts,setComponentProducts] = useState([])
  const [partValues,setPartValues] = useState({})
  useEffect(()=>{if(!parseList(product.components).length)return;api('/api/products').then(rows=>setComponentProducts(Array.isArray(rows)?rows:[])).catch(()=>setComponentProducts([]))},[product])
  const selectedAddons = addons.filter(item => Number(addonQty[item.id || item.addon_id]) > 0).map(item => ({ id:item.id || item.addon_id, name:item.name || item.addon_name, price:Number(item.price || 0), selection_quantity:Number(addonQty[item.id || item.addon_id]) }))
  const unitPrice = Number(variant?.price ?? variant?.selling_price ?? product.selling_price) + selectedAddons.reduce((sum, item) => sum + item.price * item.selection_quantity, 0)
  async function addComponent(component) {
    const child=componentProducts.find(item=>Number(item.id)===Number(component.id))
    const quantity=Math.max(1,Number(partValues[component.id]?.quantity||1))
    const price=Math.max(0,Number(partValues[component.id]?.price??component.price??child?.selling_price??0))
    const looseStock=Number(child?.stock||0),needed=quantity-looseStock,perParent=Math.max(1,Number(component.quantity||1))
    if(needed>0){
      const builds=Math.ceil(needed/perParent)
      if(Number(product.stock||0)<builds)return notify('Not enough bundle stock to harvest this component.','error')
      try{await api('/api/products/'+product.id+'/harvest',{method:'POST',body:{count:builds}});notify('Component stock harvested from '+product.name)}
      catch(error){return notify(error.message,'error')}
    }
    add({product:child||component,product_id:child?.id||component.id,parent_id:product.id,name:component.name,quantity,selling_price:price,batch_id:parseList(child?.batches)[0]?.id||null})
  }
  return <Modal title={product.name} close={close}><div className="pos-config">{parseList(product.components).length>0&&<fieldset className="components"><legend>Bundle components</legend>{parseList(product.components).map(component=>{const child=componentProducts.find(item=>Number(item.id)===Number(component.id));const values=partValues[component.id]||{};return <div className="component-row" key={component.id}><span><b>{component.name}</b><small>{component.quantity} per bundle · {Number(child?.stock||0)} loose</small></span><input aria-label="Component quantity" type="number" min="1" value={values.quantity||1} onChange={event=>setPartValues(current=>({...current,[component.id]:{...current[component.id],quantity:event.target.value}}))}/><input aria-label="Component price" type="number" min="0" value={values.price??component.price??child?.selling_price??0} onChange={event=>setPartValues(current=>({...current,[component.id]:{...current[component.id],price:event.target.value}}))}/><button type="button" onClick={()=>addComponent(component)}>{Number(child?.stock||0)>0?'Sell Part':'Harvest & Sell'}</button></div>})}</fieldset>}
    {variants.length > 0 && <fieldset><legend>Choose size / variant</legend>{variants.map(item => <label key={item.id || item.name}><input type="radio" checked={variant === item} disabled={!isRecipe(product) && Number(item.stock) <= 0} onChange={() => setVariant(item)} /><span><b>{item.name || item.variant_name}</b><small>{money(item.price ?? item.selling_price)}{!recipe ? ' - '+Number(item.stock || 0)+' left' : ''}</small></span></label>)}</fieldset>}
    {addons.length > 0 && <fieldset><legend>Add-ons</legend>{addons.map(item => { const id = item.id || item.addon_id; return <div className="addon" key={id}><span><b>{item.name || item.addon_name}</b><small>+ {money(item.price)}</small></span><button onClick={() => setAddonQty(current => ({...current,[id]:Math.max(0,Number(current[id] || 0)-1)}))}>-</button><b>{addonQty[id] || 0}</b><button onClick={() => setAddonQty(current => ({...current,[id]:Math.min(99,Number(current[id] || 0)+1)}))}>+</button></div> })}</fieldset>}
    <label>Kitchen / waiter note<div className="note-suggestions">{KITCHEN_NOTES.map(value=><button type="button" className={note.split(',').map(item=>item.trim()).includes(value)?'active':''} key={value} onClick={()=>setNote(current=>{const values=current.split(',').map(item=>item.trim()).filter(Boolean);const exists=values.includes(value);return (exists?values.filter(item=>item!==value):[...values,value]).join(', ')})}>{value}</button>)}</div><textarea maxLength="300" value={note} onChange={event => setNote(event.target.value)} /></label>
    <footer><input type="number" min="1" value={quantity} onChange={event => setQuantity(Math.max(1,Number(event.target.value) || 1))} /><strong>{money(unitPrice * quantity)}</strong><button disabled={variants.length>0&&!variant} onClick={() => add({ product, product_id:product.id, name:product.name, quantity, selling_price:unitPrice, special_instructions:normalizedNote(note) || null, variants:variant ? [{id:variant.id,name:variant.name || variant.variant_name,price:Number(variant.price ?? variant.selling_price)}] : null, addons:selectedAddons.length ? selectedAddons : null, batch_id:parseList(product.batches)[0]?.id || null, stock_variant_id:!recipe && variant ? Number(variant.id) : null })}>Add to cart</button></footer>
  </div></Modal>
}

export default function PosPage() {
  const [user,setUser] = useState(null), [authError,setAuthError] = useState(''), [stage,setStage] = useState('landing'), [orderType,setOrderType] = useState('')
  const [products,setProducts] = useState([]), [pagination,setPagination] = useState({page:1,page_size:20,total:0,total_pages:1}), [tables,setTables] = useState([]), [floors,setFloors] = useState([]), [staff,setStaff] = useState([])
  const [categories,setCategories] = useState([])
  const [cart,setCart] = useState([]), [form,setForm] = useState(emptyForm), [search,setSearch] = useState(''), [category,setCategory] = useState(''), [config,setConfig] = useState(null)
  const categoryScrollRef = useRef(null), productScrollRef = useRef(null)
  const [loading,setLoading] = useState(true), [saving,setSaving] = useState(false), [error,setError] = useState(''), [toast,setToast] = useState(null), [complete,setComplete] = useState(null), [editing,setEditing] = useState(null)
  const retail = isRetailOrder(user,orderType)
  const selectedTable = tables.find(item => Number(item.id) === Number(form.table_id))
  const assignedWaiter = staff.find(person => Number(person.id) === Number(form.waiter_id))
  const currentUserIsWaiter = ['waiter','order_taker'].includes(user?.role)
  const filtered = products.filter(item => (!category || item.category === category) && (!search || item.name?.toLowerCase().includes(search.toLowerCase())))
  const field = (name,value) => setForm(current => ({...current,[name]:value}))
  const notify = (message,type='success') => { setToast({message,type}); setTimeout(() => setToast(null),3500) }

  useEffect(() => {
    document.title = 'POS Terminal - DevForge RMS'
    api('/api/auth/me').then(({user:session}) => {
      if (!can(session,'orders.create') && !can(session,'orders.view')) throw new Error('You do not have permission to access POS Terminal.')
      setUser(session)
    }).catch(requestError => requestError.status === 401 ? location.replace(legacyUrl('/')) : setAuthError(requestError.message))
  }, [])
  useEffect(() => {
    if (!user) return
    Promise.all([api('/api/tables'),api('/api/tables/floors'),api('/api/users/assignable'),api('/api/product-categories')])
      .then(([tableRows,floorRows,staffRows,categoryRows]) => { setTables(Array.isArray(tableRows)?tableRows:[]); setFloors(Array.isArray(floorRows)?floorRows:[]); setStaff(Array.isArray(staffRows)?staffRows:[]); setCategories((Array.isArray(categoryRows)?categoryRows:[]).map(item=>item.name).filter(Boolean)) })
      .catch(requestError => setError(requestError.message))
  }, [user])
  useEffect(() => {
    if (!user) return
    const timer = setTimeout(async () => {
      const params = new URLSearchParams({paginate:'1',page:String(pagination.page),page_size:'20',menu_only:'1',exclude_components:'1'})
      if (search.trim()) params.set('search',search.trim())
      if (category) params.set('category',category)
      try { setLoading(true); setError(''); const result = await api(`/api/products?${params}`); const rows = Array.isArray(result?.items)?result.items:Array.isArray(result)?result:[]; setProducts(rows); setPagination(current => ({...(result?.pagination || {page:1,page_size:20,total:rows.length,total_pages:1}),page:Number(result?.pagination?.page || current.page)})) }
      catch (requestError) { setError(requestError.message) }
      finally { setLoading(false) }
    }, search ? 300 : 0)
    return () => clearTimeout(timer)
  }, [user,search,category,pagination.page])

  const allowedTypes = Array.isArray(user?.allowed_order_types) ? user.allowed_order_types : (['retail','retail_restaurant'].includes(user?.shop_type) ? ['walk_in','dine_in','takeaway','delivery'] : ['dine_in','takeaway','delivery'])
  function chooseType(value) { const waiterId = value === 'takeaway' && ['waiter','order_taker'].includes(user.role) ? String(user.id) : ''; setOrderType(value); setForm({...emptyForm,waiter_id:waiterId}); setCart([]); setStage(value === 'dine_in' ? 'tables' : 'terminal') }
  function chooseTable(table) { if (table.status === 'occupied') return notify('This table is currently occupied','error'); setOrderType('dine_in'); setForm(current => ({...current,table_id:String(table.id),waiter_id:String(table.assigned_waiter_id || '')})); setStage('terminal') }
  function addItem(item) {
    const selectionKey = itemSelectionKey(item)
    const existing = cart.find(row => itemSelectionKey(row) === selectionKey)
    const nextQuantity = Number(item.quantity) + Number(existing?.quantity || 0)
    const available = itemStock(item)
    if (Number.isFinite(available) && nextQuantity > available) return notify(`Only ${available} available in stock.`, 'error')
    setCart(current => existing
      ? current.map(row => row.key === existing.key ? {...row,quantity:nextQuantity,selling_price:item.selling_price} : row)
      : [...current,{...item,key:crypto.randomUUID?.() || String(Date.now()+Math.random())}])
    setConfig(null)
  }
  function changeItemQuantity(key, value) {
    const item = cart.find(row => row.key === key)
    if (!item) return
    const quantity = Math.max(1,Number(value) || 1)
    if (editing && quantity < Number(item.original_quantity || 0) && !can(user,'orders.remove_items')) return notify('Reducing an existing product requires Remove Order Items access.','error')
    const available = itemStock(item)
    if (Number.isFinite(available) && quantity > available) return notify(`Only ${available} available in stock.`, 'error')
    setCart(current => current.map(row => row.key === key ? {...row,quantity} : row))
  }
  async function editOrder(id) {
    try {
      setLoading(true)
      const [details,menu] = await Promise.all([api('/api/sales/'+id+'/bill'),api('/api/products')])
      if (!details?.sale) throw new Error('Order details not found')
      const productRows = Array.isArray(menu) ? menu : Array.isArray(menu?.items) ? menu.items : []
      const productMap = new Map(productRows.map(product => [Number(product.id),product]))
      setEditing(details.sale)
      setOrderType(details.sale.order_type || 'dine_in')
      setForm({...emptyForm,table_id:String(details.sale.table_id||''),waiter_id:String(details.sale.waiter_id||''),rider_id:String(details.sale.rider_id||''),delivery_address:details.sale.delivery_address||'',token_number:details.sale.token_number||'',discount:String(details.sale.discount||''),tax_percentage:String(details.sale.tax_percentage||''),payment_method:details.sale.payment_method||'cash',amount_received:String(details.sale.amount_received||''),customer_name:details.sale.customer_name||'',customer_phone:details.sale.customer_phone||'',customer_id:details.sale.customer_id||null,money_received:Number(details.sale.amount_received||0)>.01})
      setCart((details.items||[]).map(item=>({product_id:item.product_id,parent_id:item.parent_id||null,name:item.product_name,quantity:Number(item.quantity),original_quantity:Number(item.quantity),selling_price:Number(item.price_at_sale),special_instructions:item.special_instructions||null,variants:parseList(item.variants_json),addons:parseList(item.addons_json),batch_id:item.batch_id||null,stock_variant_id:item.stock_variant_id||null,product:productMap.get(Number(item.product_id))||null,key:crypto.randomUUID?.()||String(item.id)})))
      setStage('terminal')
      notify('Editing Order #'+(details.sale.order_number||id),'success')
    } catch(requestError) { notify(requestError.message,'error') } finally { setLoading(false) }
  }
  function cancelEdit() {
    if (!confirm('Are you sure you want to cancel editing? Changes will be lost.')) return
    setEditing(null);setCart([]);setForm(emptyForm);setStage('orders')
  }
  async function printReceipt(id,format) {
    try { const result = await api('/api/print-jobs/queue',{method:'POST',body:{sale_id:id,format,shop_id:user.shop_id || null}}); if (Number(result.queued)>0) return notify('Print sent to configured printer.'); if (format === 'kitchen') throw new Error('No kitchen printer is assigned for this order'); window.open('/print/sales/'+id+'?format='+format+'&autoprint=1&shop_id='+(user.shop_id || '')+'&timezone='+encodeURIComponent(Intl.DateTimeFormat().resolvedOptions().timeZone),'_blank','noopener') } catch (requestError) { notify(requestError.message,'error') }
  }
function openReceiptWindow(id,format) {
    window.open('/print/sales/'+id+'?format='+format+'&autoprint=1&shop_id='+(user.shop_id || '')+'&timezone='+encodeURIComponent(Intl.DateTimeFormat().resolvedOptions().timeZone),'_blank','noopener')
  }
  async function submit(status) {
    if (saving || !cart.length) return
    if (orderType === 'dine_in' && !form.table_id) return setStage('tables')
    if (orderType === 'dine_in' && !form.waiter_id) return notify('This table has no assigned waiter. Assign one in Table Management first.','error')
    if (orderType === 'takeaway' && !form.waiter_id) return notify('Select the order taker first.','error')
    const payload = { items:cart.map(saleItemPayload), discount:Number(form.discount || 0), tax_percentage:Number(form.tax_percentage || 0), payment_method:form.payment_method, amount_received:0, customer_name:form.customer_name.trim(), customer_phone:form.customer_phone.trim(), customer_id:form.customer_id || null, delivery_address:form.delivery_address.trim(), order_type:orderType, table_id:Number(form.table_id)||null, waiter_id:Number(form.waiter_id)||null, rider_id:Number(form.rider_id)||null, kitchen_id:null, guest_count:1, token_number:orderType==='takeaway' ? form.token_number.trim() || 'TK-'+Date.now() : null, order_status:status, money_received:false, client_request_id:crypto.randomUUID?.() || 'pos-'+Date.now() }
    try {
      setSaving(true)
      setError('')
      const result = await api(editing?'/api/sales/'+editing.id+'/items':'/api/sales',{method:editing?'PUT':'POST',body:payload})
      const saleId = result.saleId || editing?.id
      if (status === 'pending') {
        if (Number(result.print_jobs_queued) > 0) notify('Kitchen ticket sent to configured printer.')
        else openReceiptWindow(saleId,'kitchen')
      }
      if (retail) {
        setEditing(null)
        setCart([])
        setForm(emptyForm)
        notify('Order saved successfully.')
        setStage('orders')
        return
      }
      setComplete({id:saleId,number:result.orderNumber||editing?.order_number||saleId,total:result.total,token:payload.token_number,updated:Boolean(editing),status})
      setEditing(null)
      setCart([])
    } catch (requestError) {
      setError(requestError.message)
      notify(requestError.message,'error')
    } finally {
      setSaving(false)
    }
  }

  if (!user && !authError) return <main className="pos-status">Loading POS Terminal...</main>
  if (authError) return <main className="pos-status"><h1>POS Terminal unavailable</h1><p>{authError}</p><a href="/app/lobby">Back to modules</a></main>
  return <div className="pos-page">
{stage === 'landing' && <main className="pos-start"><div><h1>Ready to take an order?</h1><p>Start a new restaurant order or open the existing orders view.</p><section>{can(user,'orders.create')&&<button className="new" onClick={()=>setStage('types')}><i><Plus size={30}/></i><b>New Order</b><span>Choose dine-in, takeaway, or delivery</span></button>}{can(user,'orders.view')&&<button onClick={()=>setStage('orders')}><i><ClipboardList size={30}/></i><b>View Orders</b><span>Open the Orders screen already inside POS</span></button>}</section></div></main>}
{stage === 'types' && <main className="pos-start"><div><h1>Select Order Type</h1><p>Choose how this order will be served.</p><section className="types">{ORDER_TYPES.filter(row=>allowedTypes.includes(row.id)).map(({id,Icon,label,description})=><button key={id} onClick={()=>chooseType(id)}><i><Icon size={30}/></i><b>{label}</b><span>{description}</span></button>)}</section><button className="back" onClick={()=>setStage('landing')}>Back</button></div></main>}
    {stage === 'tables' && <PosTableSelection tables={tables} floors={floors} user={user} selectedId={form.table_id} choose={chooseTable} back={()=>setStage('types')}/>}
{stage === 'orders' && <PosOrdersView user={user} back={()=>setStage('landing')} notify={notify} printReceipt={printReceipt} onEdit={editOrder}/>} 
{stage === 'terminal' && <main className="pos-terminal"><section><header className="pos-tools"><button onClick={()=>setStage('types')} aria-label="Back to order types"><ArrowLeft size={18}/></button><div className="pos-heading"><ShoppingCart size={18}/><span><small>{orderType.replace('_',' ')}</small><b>POS Terminal</b></span></div><input value={search} onChange={event=>{setSearch(event.target.value);setPagination(current=>({...current,page:1}))}} placeholder="Search products..."/>{!retail&&<button onClick={()=>setStage('orders')}><ClipboardList size={16}/> Orders</button>}</header><div className="pos-scroll-horizontal"><button className="pos-scroll-arrow" onClick={()=>categoryScrollRef.current?.scrollBy({left:-240,behavior:'smooth'})} aria-label="Scroll categories left"><ChevronLeft size={18}/></button><nav className="pos-cats" ref={categoryScrollRef} onWheel={event=>{if(Math.abs(event.deltaY)>Math.abs(event.deltaX)){event.preventDefault();event.currentTarget.scrollLeft+=event.deltaY}}}><button className={!category?'active':''} onClick={()=>{setCategory('');setPagination(current=>({...current,page:1}))}}>All</button>{categories.map(name=><button className={category===name?'active':''} onClick={()=>{setCategory(name);setPagination(current=>({...current,page:1}))}} key={name}>{name}</button>)}</nav><button className="pos-scroll-arrow" onClick={()=>categoryScrollRef.current?.scrollBy({left:240,behavior:'smooth'})} aria-label="Scroll categories right"><ChevronRight size={18}/></button></div>{error&&<div className="pos-error">{error}<button onClick={()=>setError('')} aria-label="Dismiss error"><X size={16}/></button></div>}<button className="pos-product-scroll pos-product-scroll-up" onClick={()=>productScrollRef.current?.scrollBy({top:-420,behavior:'smooth'})} aria-label="Scroll products up"><ChevronUp size={18}/></button><div className="pos-products" ref={productScrollRef}>{loading?<p>Loading menu...</p>:filtered.map(product=><button className="pos-product" disabled={productStock(product)<=0} onClick={()=>setConfig(product)} key={product.id}><small><Circle size={7} fill="currentColor"/> {productStock(product)>0?'Available':'Out of stock'}</small><em>{isRecipe(product)?<ChefHat size={20}/>:productStock(product)}</em><div>{product.image_url?<img src={product.image_url} alt=""/>:<ImageIcon size={38}/>}</div><h3>{product.name}</h3><i/>{product.description&&<p>{product.description}</p>}<footer><span><small>Price</small><b>{money(product.selling_price)}</b></span><strong><ShoppingCart size={18}/></strong></footer></button>)}</div><button className="pos-product-scroll pos-product-scroll-down" onClick={()=>productScrollRef.current?.scrollBy({top:420,behavior:'smooth'})} aria-label="Scroll products down"><ChevronDown size={18}/></button>{pagination.total>0&&<footer className="pos-pagination"><span>Showing {(pagination.page-1)*pagination.page_size+1}-{Math.min(pagination.page*pagination.page_size,pagination.total)} of {pagination.total}</span><div><button disabled={pagination.page<=1} onClick={()=>setPagination(current=>({...current,page:current.page-1}))}>Previous</button><b>{pagination.page} / {pagination.total_pages}</b><button disabled={pagination.page>=pagination.total_pages} onClick={()=>setPagination(current=>({...current,page:current.page+1}))}>Next</button></div></footer>}</section>
      <aside className="pos-checkout"><header><span><small>{orderType.replace('_',' ')}</small><b>Current Order</b></span><button onClick={()=>setCart([])}>Clear</button>{editing&&<button onClick={cancelEdit}>Cancel Edit</button>}</header>
      {!retail&&orderType==='dine_in'&&<div className="pos-service"><label>Table<button onClick={()=>setStage('tables')}>{selectedTable?.table_number || 'Choose table'}</button></label><label>Assigned waiter<span className={assignedWaiter?'service-value':'service-warning'}>{assignedWaiter ? assignedWaiter.name || assignedWaiter.username : 'No waiter assigned — update Table Management'}</span></label></div>}
      {!retail&&orderType==='takeaway'&&<div className="pos-service"><label>Token<input value={form.token_number} onChange={event=>field('token_number',event.target.value)}/></label><label>Order taker{currentUserIsWaiter?<span className="service-value">{user.name || user.username}</span>:<select value={form.waiter_id} onChange={event=>field('waiter_id',event.target.value)}><option value="">Select</option>{staff.filter(person=>['waiter','order_taker'].includes(person.role)).map(person=><option value={person.id} key={person.id}>{person.name || person.username}</option>)}</select>}</label></div>}
      {!retail&&orderType==='delivery'&&<div className="pos-service"><label>Rider<select value={form.rider_id} onChange={event=>field('rider_id',event.target.value)}><option value="">Select</option>{staff.filter(person=>person.role==='rider').map(person=><option value={person.id} key={person.id}>{person.name || person.username}</option>)}</select></label><label>Address<input value={form.delivery_address} onChange={event=>field('delivery_address',event.target.value)}/></label></div>}
      <div className="pos-cart">{cart.length?cart.map(item=><article key={item.key}><span><b>{configuredItemName(item)}</b>{item.special_instructions&&<small>{item.special_instructions}</small>}</span><b>{money(item.quantity*item.selling_price)}</b><div><button onClick={()=>changeItemQuantity(item.key,item.quantity-1)}>-</button><input type="number" min="1" value={item.quantity} onChange={event=>changeItemQuantity(item.key,event.target.value)}/><button onClick={()=>changeItemQuantity(item.key,item.quantity+1)}>+</button>{(!editing||!item.original_quantity||can(user,'orders.remove_items'))&&<button onClick={()=>setCart(current=>current.filter(row=>row.key!==item.key))}>x</button>}</div></article>):<div className="cart-empty"><ShoppingCart size={34}/><b>Your cart is empty</b><small>Select a product to begin</small></div>}</div>
<div className="pos-controls pos-action-only"><footer><button className={retail?'primary':'kitchen'} disabled={saving||!cart.length} onClick={()=>submit(retail?'payment_pending':'pending')}>{saving?'Processing...':editing?(retail?'Update Order #':'Update Kitchen #')+(editing.order_number||editing.id):retail?'Save Order':'Kitchen'}</button></footer></div></aside></main>}
    {config&&<ProductOptions product={config} close={()=>setConfig(null)} add={addItem} notify={notify}/>}
    {complete&&<Modal title={complete.updated?'Order Updated':'Order Placed'} close={()=>{setComplete(null);setForm(emptyForm);setStage('types')}}><div className="pos-done"><PartyPopper size={48}/><p>Order #{complete.number}</p>{complete.token&&<b>Token: {complete.token}</b>}<strong>{money(complete.total)}</strong><button onClick={()=>printReceipt(complete.id,'customer')}>Customer Bill</button>{!retail&&<button onClick={()=>printReceipt(complete.id,'kitchen')}>Kitchen Ticket</button>}<button onClick={()=>{setComplete(null);setForm(emptyForm);setStage('types')}}>Continue Ordering</button></div></Modal>}
    {toast&&<div className={'pos-toast '+toast.type}>{toast.message}<button onClick={()=>setToast(null)} aria-label="Dismiss notification"><X size={16}/></button></div>}
  </div>
}