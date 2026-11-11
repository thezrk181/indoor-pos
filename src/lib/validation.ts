import {z} from 'zod';
const uuid=z.string().uuid(),text=z.string().trim().max(2000),amount=z.number().int().min(0).max(10000000000),time=z.string().datetime({offset:true});
const method=z.enum(['cash','bank','other']);
const slot={ground_id:uuid,starts_at:time,ends_at:time};
const version={id:uuid,version:z.number().int().positive()};
const adjustment={total_price:amount,price_reason:text,hours_override_reason:text,notes:text};
export const schemas={
 booking:z.object({...slot,...adjustment,total_price:amount.nullable(),request_id:uuid,customer_id:uuid.nullable(),customer_name:z.string().trim().min(1).max(120),phone:z.string().max(30),advance:amount,method}),
 block:z.object({...slot,request_id:uuid,notes:text.min(3)}),
 update_booking:z.object({...version,...slot,...adjustment}),
 payment:z.object({...version,request_id:uuid,kind:z.enum(['payment','refund']),amount:amount.positive(),method,note:text}),
 status:z.object({...version,status:z.enum(['completed','cancelled','no-show']),handling:z.enum(['retain','refund']).nullable()}),
 remove_block:z.object(version),
 ground:z.object({id:uuid.nullable(),name:z.string().trim().min(1).max(100),description:text,active:z.boolean(),hourly_rate:amount.max(100000000),hours:z.array(z.object({weekday:z.number().int().min(0).max(6),opens:z.number().int().min(0).max(1410).multipleOf(30),closes:z.number().int().min(30).max(2880).multipleOf(30)})).max(7)}),
 rule:z.object({id:uuid.nullable(),ground_id:uuid,name:z.string().trim().min(1).max(100),weekday:z.number().int().min(0).max(6),starts:z.number().int().min(0).max(1410).multipleOf(30),ends:z.number().int().min(30).max(1440).multipleOf(30),hourly_rate:amount.max(100000000)}),
 delete_rule:z.object({id:uuid}),customer:z.object({id:uuid,name:z.string().trim().min(1).max(120),phone:z.string().max(30),notes:text}),
 settings:z.object({name:z.string().trim().min(1).max(120),description:text,phone:text,whatsapp:text,address:text,logo_url:z.union([z.literal(''),z.url().refine(v=>v.startsWith('https://'),'Use HTTPS')]),currency:z.string().regex(/^[A-Z]{3}$/),timezone:z.string().min(1).max(100),accent:z.string().regex(/^#[0-9a-fA-F]{6}$/),receipt_note:text})
};
export type Operation=keyof typeof schemas;
