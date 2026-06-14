# Dino Pace Run

Локальный прототип 2D pixel-art runner на Phaser 3.

## Запуск

Откройте `index.html` в браузере. Сервер не нужен: Phaser 3 лежит локально в `vendor/phaser.min.js`, тестовые спрайты генерируются в коде.

## Управление

- **Space / W / ↑** — прыжок
- **S / ↓** — слайд/присед
- **R / Tap** — рестарт после столкновения
- На мобильных: кнопки **JUMP** и **SLIDE**, кнопка **⛶** включает fullscreen

## Где менять ассеты

Сейчас включены generated placeholder textures в `src/main.js`.
Когда будут готовы реальные PNG/spritesheet:

1. Положить файлы в `assets/sprites/` и `assets/backgrounds/`.
2. Обновить пути/ключи в `ASSETS` в `src/main.js`.
3. Переключить `USE_GENERATED_PLACEHOLDERS` на `false`.

## Текущие механики

- Автобег и движение мира влево
- Прыжок и двойной прыжок
- Слайд/присед
- Препятствия
- H2O collectibles
- Счёт дистанции, H2O и лучший результат в localStorage
- Параллакс-фон
- Pixel-art canvas/WebGL настройки
- Адаптивное масштабирование под desktop/mobile
