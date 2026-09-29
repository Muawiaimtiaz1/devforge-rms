import { useEffect, useState } from 'react'
import { api } from '../../api/client'

export default function PosDeliveryEditor({sale,canEdit,notify,onDone}){
  const [form,setForm]=useState({customer_name:sale.customer_name||'',customer_phone:sale.customer_phone||'',delivery_address:sale.delivery_address||'',rider_id:String(sale.rider_id||'')}),[riders,setRiders]=useState([]),[saving,setSaving]=useState(false)
  useEffect(()=>{if(canEdit)api('/api/users/assignable').then(rows=>setRiders((Array.isArray(rows)?rows:[]).filter(person=>person.role==='rider'))).catch(()=>setRiders([]))},[canEdit])
  const field=(name,value)=>setForm(current=>({...current,[name]:value}))
  async function save(markOut=false){
    if(markOut&&!form.customer_name.trim())return notify('Customer name is required','error')
    if(markOut&&!form.customer_phone.trim())return notify('Phone number is required','error')
    if(markOut&&!form.delivery_address.trim())return notify('Delivery address is required','error')
    try{setSaving(true);await api('/api/sales/'+sale.id+'/details',{method:'PATCH',body:{customer_name:form.customer_name.trim(),customer_phone:form.customer_phone.trim(),delivery_address:form.delivery_address.trim(),rider_id:Number(form.rider_id)||null}});if(markOut)await api('/api/kds/'+sale.id+'/status',{method:'PATCH',body:{status:'ready'}});notify(markOut?'Order marked out for delivery':'Delivery info updated');onDone()}catch(error){notify(error.message,'error')}finally{setSaving(false)}
  }
  if(!canEdit||sale.order_status==='ready')return <div className="delivery-summary"><span><b>{sale.customer_name||'No customer'}</b><small>{sale.customer_phone||'No phone'}</small><small>{sale.delivery_address||'No address'}</small></span><strong>{sale.rider_name||'No rider assigned'}</strong></div>
  return <div className="delivery-editor"><div className="pair"><label>Customer Name<input value={form.customer_name} onChange={event=>field('customer_name',event.target.value)}/></label><label>Phone Number<input value={form.customer_phone} onChange={event=>field('customer_phone',event.target.value)}/></label></div><label>Delivery Address<input value={form.delivery_address} onChange={event=>field('delivery_address',event.target.value)}/></label><label>Rider<select value={form.rider_id} onChange={event=>field('rider_id',event.target.value)}><option value="">No rider assigned</option>{riders.map(rider=><option value={rider.id} key={rider.id}>{rider.name||rider.username}</option>)}</select></label><footer><button disabled={saving} onClick={()=>save(false)}>Save Info</button><button disabled={saving} onClick={()=>save(true)}>Mark Out for Delivery</button></footer></div>
}