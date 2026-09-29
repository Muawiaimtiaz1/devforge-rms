import { useEffect, useState } from 'react'
import { api } from '../../api/client'
import { formatShopCurrency as money } from '../../currency'

export default function PosCustomerFields({form,setForm,due}){
  const [query,setQuery]=useState(''),[results,setResults]=useState([])
  useEffect(()=>{
    const value=query.trim()
    if(!value)return
    const timer=setTimeout(()=>api('/api/customers?status=active&search='+encodeURIComponent(value)).then(rows=>setResults(Array.isArray(rows)?rows.slice(0,5):[])).catch(()=>setResults([])),300)
    return()=>clearTimeout(timer)
  },[query])
  const change=(name,value)=>{setForm(current=>({...current,[name]:value,customer_id:null}));setResults([]);setQuery(value)}
  const choose=customer=>{setForm(current=>({...current,customer_id:customer.id,customer_name:customer.name||'',customer_phone:customer.phone||''}));setQuery('');setResults([])}
  return <div className="pos-customer"><div className="pair"><label>Cust. Name<input autoComplete="off" className={due>0?'required':''} value={form.customer_name} onChange={event=>change('customer_name',event.target.value)} placeholder={due>0?'REQUIRED for Dues':'Search or enter customer'}/></label><label>Cust. Phone<input autoComplete="off" className={due>0?'required':''} value={form.customer_phone} onChange={event=>change('customer_phone',event.target.value)} placeholder={due>0?'REQUIRED for Dues':'Search or enter phone'}/></label></div>{form.customer_id&&<div className="selected-customer"><span><b>Customer selected</b><small>Saved customer #{form.customer_id}</small></span><button type="button" onClick={()=>setForm(current=>({...current,customer_id:null}))}>Clear</button></div>}{results.length>0&&<div className="pos-suggestions">{results.map(customer=><button type="button" key={customer.id} onClick={()=>choose(customer)}><b>{customer.name}</b><small>{customer.phone||'No phone'} · {Number(customer.current_balance||0)>0?'Due '+money(customer.current_balance):'No due'}</small></button>)}</div>}</div>
}