import type {Metadata,Viewport} from 'next';
import './globals.css';
import {Pwa} from '@/components/pwa';
export const metadata:Metadata={title:'Crease · Booking POS',description:'Your ground. Your game. A purpose-built sports booking terminal.',manifest:'/manifest.webmanifest',appleWebApp:{capable:true,statusBarStyle:'black-translucent',title:'Crease'},icons:{icon:'/icons/icon-192.png',apple:'/icons/icon-192.png'}};
export const viewport:Viewport={width:'device-width',initialScale:1,themeColor:'#101a18'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}<Pwa/></body></html>;}
