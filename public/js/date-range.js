const locales = {
  en: {
    days: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
    daysShort: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
    daysMin: ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'],
    months: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
    monthsShort: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
    today: 'Today',
    clear: 'Clear',
    dateFormat: 'MM/dd/yyyy',
    timeFormat: 'hh:mm aa',
    firstDay: 0
  },
  'pt-BR': {
    days: ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'],
    daysShort: ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'],
    daysMin: ['Do', 'Se', 'Te', 'Qu', 'Qu', 'Se', 'Sa'],
    months: ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'],
    monthsShort: ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'],
    today: 'Hoje',
    clear: 'Limpar',
    dateFormat: 'dd/MM/yyyy',
    timeFormat: 'HH:mm',
    firstDay: 0
  }
};

export function createDateRangePicker(input, { language, onChange }) {
  let range = [];
  const picker = new window.AirDatepicker(input, {
    range: true,
    multipleDatesSeparator: ' – ',
    autoClose: true,
    maxDate: new Date(),
    locale: locales[language] || locales.en,
    buttons: ['clear'],
    position: 'bottom left',
    onSelect({ date }) {
      const dates = Array.isArray(date) ? date : [date].filter(Boolean);
      if (dates.length === 1) {
        return;
      }
      range = dates;
      onChange(range);
    }
  });

  return {
    range: () => range,
    setLanguage(nextLanguage) {
      picker.update({ locale: locales[nextLanguage] || locales.en });
      if (range.length) {
        picker.selectDate(range, { silent: true });
      }
    }
  };
}
