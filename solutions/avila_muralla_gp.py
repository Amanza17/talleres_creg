# Python real: este codigo se ejecuta en server.py
# Circuito: Avila - Muralla GP (Intermedia)
# Reto: completa las funciones. No basta con ir recto.
MAX_PASOS = 30000

# Ajusta estos valores despues de mirar la telemetria.
STRAIGHT_SPEED = 4
CORNER_SPEED = 2
KP = 100
KD = 0

last_error = 0
last_side = 0



def calculate_error():
    # TODO 1:
    # read_camera() devuelve 11 valores: 1=linea, 0=asfalto.
    # Calcula el centroide de los pixeles activos.
    # Error negativo = linea a la izquierda; positivo = derecha.
    sum = 0
    amount = 0
    camera = read_camera()
    for i in range (11):
       if camera[i] == 1:
            sum += i
            amount += 1
    info = (sum / amount - 5.5) / 4.5
    
    return info



def choose_speed(error):
    # TODO 2:
    # Baja la velocidad cuando el error sea grande.
    # Puedes usar abs(error), get_speed() o get_progress().
    if abs (error) > 0.3:
        return CORNER_SPEED
    return STRAIGHT_SPEED



def control(error):
    # TODO 3:
    # Implementa un controlador P o PD.
    # correction = error * KP + derivative * KD
    correction = error * KP
    return correction


for paso in range(MAX_PASOS):
    error = calculate_error()
    speed = choose_speed(error)
    correction = control(error)

    set_motor(speed - correction, speed + correction)
    sleep()

    # Puedes imprimir cada 25 decisiones para depurar sin saturar consola.
    if paso % 25 == 0:
        print(paso, read_line(), round(error, 2), round(get_speed(), 1))
