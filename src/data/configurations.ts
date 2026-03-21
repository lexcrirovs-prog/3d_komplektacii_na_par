export interface Vec3 {
  x: number
  y: number
  z: number
}

export interface AttachPoint {
  position: Vec3
  rotation: Vec3
}

export interface PartDef {
  id: string
  label: string
  model: string
  description: string
  color: string
  attachTo?: string
  position?: Vec3
  scale?: number
}

export interface ConfigurationDef {
  label: string
  extends?: string
  parts: PartDef[]
}

export interface AddonDef {
  label: string
  description: string
  parts: PartDef[]
}

export const attachPoints: Record<string, AttachPoint> = {
  steam_outlet: {
    position: { x: 0, y: 1.8, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
  },
  feed_water_inlet: {
    position: { x: -1.2, y: 1.2, z: 0.8 },
    rotation: { x: 0, y: Math.PI / 2, z: 0 },
  },
  blowdown_bottom: {
    position: { x: 0, y: -0.9, z: 0 },
    rotation: { x: Math.PI, y: 0, z: 0 },
  },
  blowdown_surface: {
    position: { x: 0.8, y: 1.0, z: 0.8 },
    rotation: { x: 0, y: 0, z: Math.PI / 2 },
  },
  tds_elbow_point: {
    position: { x: 0.85, y: 0.75, z: 0.85 },
    rotation: { x: -Math.PI / 2, y: 0, z: Math.PI / 2 },
  },
  pressure_point: {
    position: { x: 0.5, y: 1.9, z: 0.3 },
    rotation: { x: 0, y: 0, z: 0 },
  },
  level_point: {
    position: { x: 1.0, y: 1.4, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
  },
  safety_point: {
    position: { x: -0.5, y: 1.9, z: 0.3 },
    rotation: { x: 0, y: 0, z: 0 },
  },
  auto_blowdown_point: {
    position: { x: 0.5, y: -0.9, z: 0.5 },
    rotation: { x: Math.PI, y: 0, z: 0 },
  },
  conductivity_point: {
    position: { x: 0.8, y: 0.5, z: 0.9 },
    rotation: { x: 0, y: 0, z: Math.PI / 2 },
  },
  controller_point: {
    position: { x: 1.5, y: 0.8, z: -1.0 },
    rotation: { x: 0, y: -Math.PI / 2, z: 0 },
  },
  plc_point: {
    position: { x: 1.5, y: 0.3, z: -1.0 },
    rotation: { x: 0, y: -Math.PI / 2, z: 0 },
  },
  plc_mount: {
    position: { x: 1.8, y: 0.5, z: -1.0 },
    rotation: { x: 0, y: -Math.PI / 2, z: 0 },
  },
  burner_front: {
    position: { x: 0, y: 0, z: 1.5 },
    rotation: { x: 0, y: 0, z: 0 },
  },
  economizer_rear: {
    position: { x: 0, y: 0.3, z: -2.0 },
    rotation: { x: 0, y: Math.PI, z: 0 },
  },
}

export const configurations: Record<string, ConfigurationDef> = {
  standard: {
    label: 'Стандарт',
    parts: [
      {
        id: 'gate_valve_manual_1',
        label: 'Задвижка запорная ручная',
        model: 'gate_valve',
        attachTo: 'steam_outlet',
        color: '#4a90d9',
        description:
          'Задвижка запорная ручная на главном паропроводе. Обеспечивает перекрытие подачи пара для обслуживания и аварийных ситуаций.',
      },
      {
        id: 'blowdown_valve_salt',
        label: 'Продувочный клапан (солесодержание)',
        model: 'blowdown_valve',
        attachTo: 'blowdown_surface',
        color: '#e8963a',
        description:
          'Продувка по солесодержанию — удаление растворённых солей из котловой воды. Предотвращает накипеобразование на теплообменных поверхностях.',
      },
      {
        id: 'tds_elbow',
        label: 'Колено PC F20x20-PN25-DN20',
        model: 'elbow_pc_f20',
        attachTo: 'tds_elbow_point',
        color: '#a8b0b8',
        description:
          'Колено PC F20x20-PN 25-DN 20xDN 20 — фитинг трубопровода продувки по солесодержанию. Обеспечивает поворот линии продувки от патрубка котла к продувочному клапану.',
      },
      {
        id: 'blowdown_valve_sludge',
        label: 'Продувочный клапан (шлам)',
        model: 'blowdown_valve',
        attachTo: 'blowdown_bottom',
        color: '#d4762c',
        description:
          'Продувка по шламу — удаление механических примесей со дна барабана. Выполняется периодически для поддержания качества котловой воды.',
      },
      {
        id: 'pressure_sensor',
        label: 'Датчик давления',
        model: 'pressure_sensor',
        attachTo: 'pressure_point',
        color: '#4caf50',
        description:
          'Датчик давления пара. Обеспечивает непрерывный мониторинг давления в барабане котла для безопасной эксплуатации.',
      },
      {
        id: 'level_sensor',
        label: 'Датчик уровня воды',
        model: 'level_sensor',
        attachTo: 'level_point',
        color: '#fdd835',
        description:
          'Датчик уровня воды в барабане. Критически важен для предотвращения перегрева при низком уровне воды.',
      },
      {
        id: 'safety_valve',
        label: 'Предохранительный клапан',
        model: 'safety_valve',
        attachTo: 'safety_point',
        color: '#e53935',
        description:
          'Предохранительный клапан. Автоматически сбрасывает избыточное давление пара при превышении допустимого значения.',
      },
    ],
  },
  comfort: {
    label: 'Комфорт',
    extends: 'standard',
    parts: [
      {
        id: 'gate_valve_electric_blowdown',
        label: 'Задвижка с электроприводом',
        model: 'electric_valve',
        attachTo: 'auto_blowdown_point',
        color: '#7b1fa2',
        description:
          'Задвижка с электроприводом для автоматической продувки. Управляется контроллером по сигналу датчика солесодержания.',
      },
      {
        id: 'conductivity_sensor',
        label: 'Датчик солесодержания',
        model: 'pressure_sensor',
        attachTo: 'conductivity_point',
        color: '#00acc1',
        description:
          'Датчик солесодержания — автоматический контроль качества котловой воды. Измеряет электропроводность для определения концентрации солей.',
      },
      {
        id: 'tds_controller',
        label: 'Контроллер продувки',
        model: 'controller',
        attachTo: 'controller_point',
        color: '#546e7a',
        description:
          'Контроллер автоматической продувки. Анализирует показания датчика солесодержания и управляет клапаном продувки.',
      },
      {
        id: 'modbus_module',
        label: 'Модуль Modbus',
        model: 'controller',
        attachTo: 'plc_point',
        color: '#455a64',
        scale: 0.7,
        description:
          'Модуль Modbus для интеграции с АСУ ТП верхнего уровня. Обеспечивает передачу данных о состоянии котла в систему диспетчеризации.',
      },
    ],
  },
  comfort_plus: {
    label: 'Комфорт+',
    extends: 'comfort',
    parts: [
      {
        id: 'feed_water_modulation',
        label: 'Модуляция питательной воды',
        model: 'electric_valve',
        attachTo: 'feed_water_inlet',
        color: '#1565c0',
        description:
          'Модуляция питательной воды — плавное регулирование подачи воды в котёл, стабилизация уровня с точностью ±20мм. Снижает нагрузку на насосы.',
      },
      {
        id: 'main_steam_valve_electric',
        label: 'ГПЗ с электроприводом',
        model: 'electric_valve',
        attachTo: 'steam_outlet',
        color: '#0d47a1',
        description:
          'Главная паровая задвижка (ГПЗ) с электроприводом — моторизованное открытие/закрытие паропровода. Заменяет ручную задвижку из комплектации "Стандарт".',
      },
      {
        id: 'plc_controller',
        label: 'ПЛК Siemens',
        model: 'plc',
        attachTo: 'plc_mount',
        color: '#37474f',
        description:
          'ПЛК с модуляцией питательной воды — давление пара ±0.2 кг/см², ежедневная самодиагностика аварийных датчиков уровня. Полная автоматизация работы котла.',
      },
    ],
  },
}

export const addons: Record<string, AddonDef> = {
  deaerator: {
    label: 'Деаэратор',
    description:
      'Атмосферный деаэратор с питательными насосами. Удаляет растворённый кислород и CO₂ из питательной воды.',
    parts: [
      {
        id: 'deaerator_unit',
        label: 'Деаэратор атмосферный',
        model: 'deaerator',
        color: '#00897b',
        position: { x: -4, y: 0.5, z: 0 },
        description:
          'Атмосферный деаэратор — удаление растворённого кислорода и CO₂ из питательной воды. Критически важен для пищевых и грибных производств. Предотвращает кислородную коррозию труб.',
      },
      {
        id: 'feed_pump_1',
        label: 'Питательный насос №1',
        model: 'feed_pump',
        color: '#1565c0',
        position: { x: -3, y: -0.5, z: -1 },
        description:
          'Питательный насос №1 (рабочий). Подаёт деаэрированную воду в котёл под давлением. Производительность подбирается по паропроизводительности котла.',
      },
      {
        id: 'feed_pump_2',
        label: 'Питательный насос №2',
        model: 'feed_pump',
        color: '#1976d2',
        position: { x: -3, y: -0.5, z: 1 },
        description:
          'Питательный насос №2 (резервный). Автоматически включается при отказе основного насоса. Требование Ростехнадзора для котлов свыше 0.7 МПа.',
      },
    ],
  },
  economizer: {
    label: 'Экономайзер',
    description:
      'Утилизация тепла уходящих газов для подогрева питательной воды. Повышает КПД котла на 5-7%.',
    parts: [
      {
        id: 'economizer_unit',
        label: 'Экономайзер',
        model: 'economizer',
        attachTo: 'economizer_rear',
        color: '#795548',
        description:
          'Экономайзер — утилизация тепла уходящих газов для подогрева питательной воды. Повышает КПД котла на 5-7%. Снижает температуру уходящих газов до 130-150°C.',
      },
    ],
  },
  burner: {
    label: 'Горелка',
    description:
      'Газовая/дизельная горелка. Устанавливается в переднюю дверцу котла.',
    parts: [
      {
        id: 'burner_unit',
        label: 'Горелка газовая',
        model: 'burner',
        attachTo: 'burner_front',
        color: '#e65100',
        description:
          'Горелка газовая/дизельная — устанавливается в переднюю дверцу котла. Модуляция мощности от 30% до 100% обеспечивает экономичный режим работы.',
      },
    ],
  },
}
