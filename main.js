'use strict'
/*
 * Created with @iobroker/create-adapter v1.9.0
 */
// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = require('@iobroker/adapter-core')
// Time Modules
const cron = require('node-cron') // Cron Schedulervar

class timecounter extends utils.Adapter {
  /**
  * @param {Partial<ioBroker.AdapterOptions>} [options={}]
  */
  constructor (options) {
    super({
      ...options,
      name: 'timecounter'
    })
    this.dicCountIfGreaterOrEqual = {}
    this.on('ready', this.onReady.bind(this))
    this.on('objectChange', this.onObjectChange.bind(this))
    this.on('stateChange', this.onStateChange.bind(this))
    // this.on("message", this.onMessage);
    this.on('unload', this.onUnload.bind(this))
  }

  /**
  * Is called when databases are connected and adapter received configuration.
  */
  async onReady () {
    await this.initialObjects()
    this.subscribeForeignObjects('*')

    // repeat evey minute the calculation of the totalEnergy
    cron.schedule('* * * * *', async () => {
      this.log.debug('cron started')

      for (let idobject in this.dicCountIfGreaterOrEqual) {
        await this.calcNewTimeinCounter(idobject)
      }
    })
  }

  /**
  * Is called if a subscribed object changes
  * @param {string} id
  * @param {ioBroker.Object | null | undefined} obj
  */
  async onObjectChange (id, obj) {
    let settingsforme = (obj && obj.common && obj.common.custom && obj.common.custom[this.namespace])
    let oldsettingsexist = (id in this.dicCountIfGreaterOrEqual)

    if (settingsforme || oldsettingsexist) { await this.initialObjects() }
  }

  /**
  * Is called if a subscribed state changes
  * @param {string} id
  * @param {ioBroker.State | null | undefined} state
  */
  async onStateChange (id, state) {
    if (state && (id in this.dicCountIfGreaterOrEqual)) {
      this.log.info(id + ' state changed')
      await this.calcNewTimeinCounter(id)
      // @ts-ignore
      this.dicIdLastValue[id] = await this.getForeignStateAsync(id)
    }
  }

  /**
  * create for every enabled object the needed stats and set it to initial it
  */
  async initialObjects () {
    this.log.info('inital all Objects')

    // all unsubscripe to begin completly new
    this.unsubscribeForeignStates('*')
    // delete all dics
    this.dicCountIfGreaterOrEqual = {}
    this.dicIdTotalTime = {}
    this.dicIdLastValue = {}
    // read out all Objects
    let objects = await this.getForeignObjectsAsync('')
    for (let idobject in objects) {
      let iobrokerObject = objects[idobject]
      // only do something when enabled and MaxPowerset
      if (iobrokerObject && iobrokerObject.common && iobrokerObject.common.custom && iobrokerObject.common.custom[this.namespace] && iobrokerObject.common.custom[this.namespace].enabled && iobrokerObject.common.custom[this.namespace].idTotalTime && iobrokerObject.common.custom[this.namespace].countIfGreaterOrEqual) {
        this.log.info('initial (check OK): ' + iobrokerObject._id)

          // @ts-ignore
          this.dicIdTotalTime[iobrokerObject._id] = iobrokerObject.common.custom[this.namespace].idTotalTime

          // @ts-ignore
          this.dicCountIfGreaterOrEqual[iobrokerObject._id] = iobrokerObject.common.custom[this.namespace].countIfGreaterOrEqual


          // @ts-ignore
          this.dicIdLastValue[iobrokerObject._id] = await this.getForeignStateAsync(iobrokerObject._id)

          await this.createObjectsForId(iobrokerObject)
          this.log.debug('subscribeForeignStates ' + iobrokerObject._id)
          await this.subscribeForeignStatesAsync(iobrokerObject._id)
          await this.calcNewTimeinCounter(iobrokerObject._id)
          this.log.debug('initial done ' + iobrokerObject._id)
        
      }
    }
    this.log.info('initial completed')
  }

  /**
  * calc the Total Energy size the last Change and add it
  * @param {string} id
  */
  async calcNewTimeinCounter (id) {
    // Die Aktuelle Power auslesen
    let idobjTotalTime = this.getIdTotalTime(id)
    // EnergyTotal auslesen, timestamp und aktueller wert wird benötigt
    let objTotalTime = await this.getForeignStateAsync(idobjTotalTime)
    let toAddTime = 0
    let newTotalTime = 0
    // Wenn Datenpunkt noch keinen Wert hat nichts berechnen
    if (objTotalTime) {
      if (!objTotalTime.val){
        objTotalTime.val = 0
      }
      // @ts-ignore
      let lastValue = this.dicIdLastValue[id]
      // @ts-ignore
      let ifGreaterOrEquan = this.dicCountIfGreaterOrEqual[id]

      if (lastValue && lastValue >= ifGreaterOrEquan)
      {
        // berechnen wieviel Minuten dazukommen (alles auf 2 nachkomma runden)
        toAddTime = Math.round(60 * (((new Date().getTime()) - objTotalTime.ts) / 3600000) * 100) / 100
        newTotalTime = Math.round((objTotalTime.val + toAddTime) * 100) / 100
      }
      else
      {
        toAddTime = -1
      }

    }
    if (toAddTime >= 0) {
      // neuen wert setzen
      this.log.debug(idobjTotalTime + ' set ' + newTotalTime + ' (added:' + toAddTime + ')')
      await this.setForeignStateAsync(idobjTotalTime, { val: newTotalTime, ack: true })
    }
    else {
      this.log.debug(id + ' update timestamp')
      await this.setForeignStateAsync(this.getIdTotalTime(id), { ts: new Date().getTime(), ack: true })
    }

  }

  /**
  * create Datapoints needed for a datapoint
  * @param {ioBroker.Object} iobrokerObject
  */
  async createObjectsForId (iobrokerObject) {
    this.log.debug('create Datapoints for ' + iobrokerObject + ' if not exists')

    this.log.debug('create ' + this.getIdTotalTime(iobrokerObject._id) + ' if not exists')
    await this.setForeignObjectNotExistsAsync(this.getIdTotalTime(iobrokerObject._id), {
      type: 'state',
      common: {
        // @ts-ignore
        name: iobrokerObject.common.name + this.IdTotalTime[iobrokerObject._id],
        role: 'value.interval',
        type: 'number',
        desc: 'Created by timecounter',
        unit: 'min',
        read: true,
        write: false,
        def: 0
      },
      native: {}
    })
  }

 
  /**
  * gibt die id für Virtual_Energy_Total zurück
  * @param {string} id
  */
  getIdParent (id) {
    return id.substr(0, id.lastIndexOf('.') + 1)
  }


  /**
  * Gibt die ID für Virtual_Energy_Power zurück
  * @param {string} id
  */
  getIdTotalTime (id) {
    // @ts-ignore
    return this.getIdParent(id) + this.IdTotalTime[id]
  }



  /**
  * Is called when adapter shuts down - callback has to be called under any circumstances!
  * @param {() => void} callback
  */
  async onUnload (callback) {
    try {
      this.log.info('cleaned everything up...')
      callback()
    } catch (e) {
      callback()
    }
  }
}

// @ts-ignore
if (module.parent) {
  // Export the constructor in compact mode
  /**
  * @param {Partial<ioBroker.AdapterOptions>} [options={}]
  */
  module.exports = (options) => new timecounter(options)
} else {
  // otherwise start the instance directly
  new timecounter()
}
