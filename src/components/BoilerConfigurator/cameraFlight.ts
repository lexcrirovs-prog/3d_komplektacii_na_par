import {MathUtils, Spherical, Vector3} from 'three'

/** Orbit around the moving point of interest instead of cutting through it. */
export function createCameraFlight(fromPosition: Vector3, fromTarget: Vector3, toPosition: Vector3, toTarget: Vector3) {
  const from = new Spherical().setFromVector3(fromPosition.clone().sub(fromTarget))
  const to = new Spherical().setFromVector3(toPosition.clone().sub(toTarget))
  const yaw = Math.atan2(Math.sin(to.theta - from.theta), Math.cos(to.theta - from.theta))
  const travel = fromPosition.distanceTo(toPosition)
  const angle = Math.hypot(yaw, to.phi - from.phi)
  return {
    fromPosition: fromPosition.clone(), fromTarget: fromTarget.clone(),
    toPosition: toPosition.clone(), toTarget: toTarget.clone(), from, to, yaw,
    duration: MathUtils.clamp(.7 + Math.sqrt(travel) * .14 + angle * .14, .8, 1.8),
    lift: MathUtils.clamp((fromTarget.distanceTo(toTarget) - 3) * .15, 0, 4),
  }
}

export type CameraFlight = ReturnType<typeof createCameraFlight>

export function sampleCameraFlight(flight: CameraFlight, progress: number, position: Vector3, target: Vector3) {
  if (progress <= 0) { position.copy(flight.fromPosition); target.copy(flight.fromTarget); return }
  if (progress >= 1) { position.copy(flight.toPosition); target.copy(flight.toTarget); return }
  // Zero speed and acceleration at both ends. The shortest yaw avoids a full spin.
  const t = progress * progress * progress * (progress * (progress * 6 - 15) + 10)
  target.lerpVectors(flight.fromTarget, flight.toTarget, t)
  target.y += flight.lift * Math.sin(Math.PI * t) ** 2
  const radius = Math.exp(MathUtils.lerp(Math.log(Math.max(.001, flight.from.radius)), Math.log(Math.max(.001, flight.to.radius)), t))
  position.setFromSphericalCoords(radius, MathUtils.lerp(flight.from.phi, flight.to.phi, t), flight.from.theta + flight.yaw * t).add(target)
}
