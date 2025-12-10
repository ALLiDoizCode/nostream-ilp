import { App } from '../app/app'
import { SettingsStatic } from '../utils/settings'
import cluster from 'cluster'
import process from 'process'

export const appFactory = () => {
  return new App(process, cluster, SettingsStatic.createSettings)
}
