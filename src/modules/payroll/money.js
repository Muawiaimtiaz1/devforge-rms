function parseScaled(value, scale = 2) { const match=String(value).match(/^(\d+)(?:\.(\d+))?$/); if(!match) throw new Error('Invalid fixed-precision value.'); const fraction=(match[2]||'').padEnd(scale,'0').slice(0,scale); return BigInt(match[1])*10n**BigInt(scale)+BigInt(fraction||0); }
function divideHalfUp(numerator, denominator) { if(denominator<=0n) throw new Error('Invalid payroll divisor.'); return (numerator + denominator/2n)/denominator; }
function formatMinor(value) { const negative=value<0n; const absolute=negative?-value:value; return `${negative?'-':''}${absolute/100n}.${String(absolute%100n).padStart(2,'0')}`; }
module.exports={ parseScaled,divideHalfUp,formatMinor };
