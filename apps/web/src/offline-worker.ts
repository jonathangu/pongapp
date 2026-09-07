/** Registrations outlive upgrades; cached ServiceWorker objects do not. */
export async function currentOfflineWorker(container: ServiceWorkerContainer, scope: string): Promise<ServiceWorker | null> {
  const registration = await container.getRegistration(scope)
  const active = registration?.active
  return active && active.state !== 'redundant' ? active : null
}
