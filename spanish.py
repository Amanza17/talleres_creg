"""Spanish aliases for Formula Python Lab.

Default simulator code should use the Python-style API:
    read_line(), set_motor(left, right), sleep(), get_speed(),
    get_progress(), time(), print(...)

Inside the simulator you may write:
    from spanish import *

to get these aliases:
    leer_linea      -> read_line
    motor           -> set_motor
    esperar         -> sleep
    leer_velocidad  -> get_speed
    leer_progreso   -> get_progress
    tiempo          -> time
    imprimir        -> print

This file documents the compatibility layer. The simulator injects the real
aliases at runtime because those functions are bound to the current car.
"""

__all__ = [
    "leer_linea", "motor", "esperar", "leer_velocidad",
    "leer_progreso", "tiempo", "imprimir",
]


def _unavailable(*_args, **_kwargs):
    raise RuntimeError(
        "spanish.py solo funciona dentro del simulador con: from spanish import *"
    )

leer_linea = _unavailable
motor = _unavailable
esperar = _unavailable
leer_velocidad = _unavailable
leer_progreso = _unavailable
tiempo = _unavailable
imprimir = _unavailable
