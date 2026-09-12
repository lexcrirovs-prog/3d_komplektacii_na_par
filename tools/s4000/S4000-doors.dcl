s4000_doors : dialog {
 label = "PREMIUM S-4000 | Комфорт | 8–12 бар";
 : boxed_row { label = "Шкаф управления";
  : button { key = "co"; label = "Открыть шкаф"; width = 22; }
  : button { key = "cc"; label = "Закрыть шкаф"; width = 22; }
 }
 : boxed_row { label = "Передняя дверь котла";
  : button { key = "bo"; label = "Открыть дверь"; width = 22; }
  : button { key = "bc"; label = "Закрыть дверь"; width = 22; }
 }
 : row {
  : button { key = "allopen"; label = "Открыть обе"; }
  : button { key = "allclose"; label = "Закрыть обе"; }
 }
 : boxed_row { label = "Ракурс";
  : button { key = "cv"; label = "Шкаф крупно"; }
  : button { key = "bv"; label = "Трубки котла"; }
  : button { key = "av"; label = "Вся сборка"; }
  : button { key = "dv"; label = "Деаэратор"; }
 }
 : button { key = "options"; label = "Выбор оборудования"; }
 : button { key = "cancel"; label = "Вернуться к модели"; is_cancel = true; }
}
