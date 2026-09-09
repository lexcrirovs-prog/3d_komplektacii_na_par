s3000 : dialog {
  label = "PREMIUM S-3000 — открывание";
  : boxed_row {
    label = "Шкаф управления";
    : button { key = "co"; label = "Открыть шкаф"; width = 20; }
    : button { key = "cc"; label = "Закрыть шкаф"; width = 20; }
  }
  : boxed_row {
    label = "Передняя дверь котла";
    : button { key = "bo"; label = "Открыть дверь"; width = 20; }
    : button { key = "bc"; label = "Закрыть дверь"; width = 20; }
  }
  : row {
    : button { key = "allopen"; label = "Открыть обе"; }
    : button { key = "allclose"; label = "Закрыть обе"; }
  }
  spacer;
  : boxed_row {
    label = "Ракурс";
    : button { key = "cv"; label = "Шкаф крупно"; }
    : button { key = "bv"; label = "Трубки котла"; }
    : button { key = "av"; label = "Вся сборка"; }
  }
  : button { key = "cancel"; label = "Вернуться к модели"; is_cancel = true; }
}
