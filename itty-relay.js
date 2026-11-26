/*! itty-sockets 0.9.3 | https://github.com/kwhitley/itty-sockets
MIT License

Copyright (c) 2025 Kevin R. Whitley

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

*/
let e=(e,s={})=>{let a,t,n=[],p={},o=()=>(a||(a=new WebSocket((/^wss?:/.test(e)?e:"wss://itty.ws/c/"+e)+"?"+new URLSearchParams(s)),a.onmessage=(e,s=JSON.parse(e.data),a=s?.message,t={...null==a?.[0]&&a,...s})=>[t.type,s.type?0:"message","*"].map(e=>p[e]?.map(e=>e(t))),a.onopen=()=>(n.splice(0).map(e=>a.send(e)),p.open?.map(e=>e(t)),t&&a?.close()),a.onclose=()=>(t=a=null,p.close?.map(e=>e(t)))),l),l={open:o,send:(e,s)=>(e=(s?`${s}`:"")+JSON.stringify(e),1&a?.readyState?a.send(e):n.push(e),o()),on:(e,s)=>((p[e?.[0]?e:"*"]??=[]).push(e?.[0]?s:a=>e?.(a)&&s(a)),o()),remove:(e,s)=>(p[e]=p[e]?.filter(e=>e!=s),l),close:()=>(1&a?.readyState?a.close():t=1,l),push:(e,s)=>(t=1,l.send(e,s))};return l};export{e as connect};
