s4000_options : dialog {
 label = "PREMIUM S-4000 | 8–12 бар | Комфорт";
 : boxed_column { label = "Комплектация";
  : toggle { key = "economizer"; label = "Экономайзер EQS2-4000"; }
  : toggle { key = "deaerator"; label = "Деаэратор ДА-15"; }
  : toggle { key = "modulation"; label = "Модуляция питательной воды"; }
  : toggle { key = "gpz"; label = "Главная паровая задвижка с электроприводом"; }
 }
 : boxed_column { label = "Отдельные объекты";
  : toggle { key = "bdv"; label = "BDV60/5"; }
  : toggle { key = "fv"; label = "FV8"; }
 }
 : text { label = "Трасса питания изменяется вместе с выбором экономайзера."; }
 : text { label = "Текущая ведомость: 12 бар. Насосы JETEX V4-19."; }
 spacer; ok_cancel;
}
