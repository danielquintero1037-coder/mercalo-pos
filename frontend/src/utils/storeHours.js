// Horario de atención de Mercalo y cálculo de festivos colombianos (Ley Emiliani)
// Lunes a sábado: 8:00 a.m. - 7:30 p.m.
// Domingos: 8:00 a.m. - 5:00 p.m.
// Festivos: 8:00 a.m. - 2:00 p.m.

function calculateEaster(year) {
  // Algoritmo de Gauss (calendario gregoriano) para Domingo de Resurrección
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function nextMonday(date) {
  const d = new Date(date);
  const day = d.getDay(); // 0=domingo, 1=lunes
  if (day === 1) return d;
  const diff = (8 - day) % 7 || 7;
  d.setDate(d.getDate() + diff);
  return d;
}

function dateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function getColombianHolidays(year) {
  const easter = calculateEaster(year);
  const holidays = new Set();

  // Festivos fijos (no aplica Ley Emiliani)
  holidays.add(dateKey(new Date(year, 0, 1)));   // Año Nuevo
  holidays.add(dateKey(new Date(year, 4, 1)));   // Día del Trabajo
  holidays.add(dateKey(new Date(year, 6, 20)));  // Independencia
  holidays.add(dateKey(new Date(year, 7, 7)));   // Batalla de Boyacá
  holidays.add(dateKey(new Date(year, 11, 8)));  // Inmaculada Concepción
  holidays.add(dateKey(new Date(year, 11, 25))); // Navidad

  // Ligados a Semana Santa (fijos respecto a Pascua, no se trasladan)
  holidays.add(dateKey(addDays(easter, -3))); // Jueves Santo
  holidays.add(dateKey(addDays(easter, -2))); // Viernes Santo

  // Festivos que se trasladan al lunes siguiente (Ley Emiliani)
  holidays.add(dateKey(nextMonday(new Date(year, 0, 6))));   // Reyes Magos
  holidays.add(dateKey(nextMonday(new Date(year, 2, 19))));  // San José
  holidays.add(dateKey(nextMonday(addDays(easter, 39))));    // Ascensión del Señor
  holidays.add(dateKey(nextMonday(addDays(easter, 60))));    // Corpus Christi
  holidays.add(dateKey(nextMonday(addDays(easter, 68))));    // Sagrado Corazón
  holidays.add(dateKey(nextMonday(new Date(year, 5, 29))));  // San Pedro y San Pablo
  holidays.add(dateKey(nextMonday(new Date(year, 7, 15))));  // Asunción de la Virgen
  holidays.add(dateKey(nextMonday(new Date(year, 9, 12))));  // Día de la Raza
  holidays.add(dateKey(nextMonday(new Date(year, 10, 1))));  // Todos los Santos
  holidays.add(dateKey(nextMonday(new Date(year, 10, 11)))); // Independencia de Cartagena

  return holidays;
}

function getBogotaNow() {
  // Usa la hora de Bogotá sin importar la zona horaria del dispositivo/servidor
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Bogota',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(new Date());
  const map = {};
  parts.forEach(p => { map[p.type] = p.value; });
  const hour = map.hour === '24' ? '00' : map.hour;
  return new Date(`${map.year}-${map.month}-${map.day}T${hour}:${map.minute}:${map.second}`);
}

export function getStoreStatus() {
  const now = getBogotaNow();
  const dayOfWeek = now.getDay(); // 0=domingo ... 6=sábado
  const timeInMinutes = now.getHours() * 60 + now.getMinutes();

  const holidays = getColombianHolidays(now.getFullYear());
  const isHoliday = holidays.has(dateKey(now));

  const openMinutes = 8 * 60; // 8:00 a.m. todos los días
  let closeMinutes;
  if (dayOfWeek === 0) {
    closeMinutes = 17 * 60; // Domingos 5:00 p.m.
  } else if (isHoliday) {
    closeMinutes = 14 * 60; // Festivos 2:00 p.m.
  } else {
    closeMinutes = 19 * 60 + 30; // Lunes a sábado 7:30 p.m.
  }

  const isOpen = timeInMinutes >= openMinutes && timeInMinutes < closeMinutes;

  return { isOpen, isHoliday, dayOfWeek };
}

export const STORE_CLOSED_MESSAGE = 'Muchas gracias por el pedido y será procesado la primera hora del día de mañana, ya que nos encontramos cerrados en este momento. ¿Desea continuar?';
