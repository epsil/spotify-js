#!/usr/bin/env node

var request = require('request')

var defaults = require('./defaults')
var lastfm = require('./lastfm')(defaults.api)

var spotify = {}

/**
 * Create album entry.
 * @constructor
 * @param {string} entry - The album to search for.
 * @param {string} [response] - JSON album object.
 */
spotify.Album = function (entry, response) {
  /**
   * Entry string.
   */
  this.entry = entry.trim()

  /**
   * Number of albums to fetch.
   */
  this.limit = null

  if (this.isSearchResponse(response)) {
    this.searchResponse = response
  } else if (this.isAlbumResponse(response)) {
    this.albumResponse = response
  }
}

/**
 * Create a queue of tracks.
 * @param {JSON} response - A JSON response object.
 * @return {Promise | spotify.Queue} A queue of tracks.
 */
spotify.Album.prototype.createQueue = function (response) {
  var self = this
  var tracks = response.tracks.items.map(function (item) {
    return new spotify.Track(self.entry, item)
  })
  var queue = new spotify.Queue(tracks)
  if (self.limit) {
    queue = queue.slice(0, self.limit)
  }
  return queue
}

/**
 * Dispatch entry.
 * @return {Promise | spotify.Queue} A queue of tracks.
 */
spotify.Album.prototype.dispatch = function () {
  var self = this
  if (this.searchResponse) {
    return this.fetchAlbum().then(function (response) {
      return self.createQueue(response)
    })
  } else if (this.albumResponse) {
    return this.fetchAlbum().then(function (response) {
      return self.createQueue(response)
    })
  } else {
    return this.searchForAlbum(this.entry).then(function () {
      return self.fetchAlbum()
    }).then(function (response) {
      return self.createQueue(response)
    })
  }
}

/**
 * Fetch album metadata.
 * @return {Promise | JSON} A JSON response.
 */
spotify.Album.prototype.fetchAlbum = function () {
  var id = this.id()
  var url = 'https://api.spotify.com/v1/albums/'
  url += encodeURIComponent(id)
  var self = this
  return spotify.request(url).then(function (response) {
    if (self.isAlbumResponse(response)) {
      self.albumResponse = response
      return Promise.resolve(response)
    } else {
      return Promise.reject(response)
    }
  })
}

/**
 * Spotify ID.
 * @return {string} The Spotify ID of the album,
 * or `-1` if not available.
 */
spotify.Album.prototype.id = function () {
  if (this.albumResponse &&
      this.albumResponse.id) {
    return this.albumResponse.id
  } else if (this.searchResponse &&
             this.searchResponse.albums &&
             this.searchResponse.albums.items &&
             this.searchResponse.albums.items[0] &&
             this.searchResponse.albums.items[0].id) {
    return this.searchResponse.albums.items[0].id
  } else {
    return -1
  }
}

/**
 * Whether a JSON response is an album response.
 * @param {JSON} response - A JSON response object.
 * @return {boolean} `true` if `response` is an album response,
 * `false` otherwise.
 */
spotify.Album.prototype.isAlbumResponse = function (response) {
  return response &&
    response.id
}

/**
 * Whether a JSON response is an album search response.
 * @param {JSON} response - A JSON response object.
 * @return {boolean} `true` if `response` is an album search response,
 * `false` otherwise.
 */
spotify.Album.prototype.isSearchResponse = function (response) {
  return response &&
    response.albums &&
    response.albums.items[0] &&
    response.albums.items[0].id
}

/**
 * Search for album.
 * @param {string} query - The query text.
 * @return {Promise | JSON} A JSON response, or `null` if not found.
 */
spotify.Album.prototype.searchForAlbum = function (query) {
  // https://developer.spotify.com/web-api/search-item/
  var url = 'https://api.spotify.com/v1/search?type=album&q='
  url += encodeURIComponent(query)
  var self = this
  return spotify.request(url).then(function (response) {
    if (self.isSearchResponse(response)) {
      self.searchResponse = response
      return Promise.resolve(response)
    } else {
      return Promise.reject(response)
    }
  }).then(null, function () {
    console.log('COULD NOT FIND ' + query)
    return Promise.reject(null)
  })
}

/**
 * Set the number of albums to fetch.
 * @param {integer} limit - The maximum amount of albums.
 */
spotify.Album.prototype.setLimit = function (limit) {
  if (Number.isInteger(limit)) {
    this.limit = limit
  }
}

/**
 * Artist entry.
 * @constructor
 * @param {string} entry - The artist to search for.
 */
spotify.Artist = function (entry) {
  /**
   * Albums response.
   */
  this.albumsResponse = null

  /**
   * Search response.
   */
  this.artistResponse = null

  /**
   * Entry string.
   */
  this.entry = null

  /**
   * Number of tracks to fetch.
   */
  this.limit = null

  /**
   * Top tracks response.
   */
  this.topTracksResponse = null

  this.entry = entry.trim()
}

/**
 * Create a queue of tracks.
 * @param {JSON} response - A JSON response object.
 * @return {Promise | spotify.Queue} A queue of tracks.
 */
spotify.Artist.prototype.createQueue = function (response) {
  var self = this
  if (self.isTopTracksResponse(response)) {
    var tracks = response.tracks.map(function (item) {
      return new spotify.Track(self.entry, item)
    })
    var trackQueue = new spotify.Queue(tracks)
    if (self.limit) {
      trackQueue = trackQueue.slice(0, self.limit)
    }
    return trackQueue
  } else {
    var albums = response.items.map(function (item) {
      return new spotify.Album(self.entry, item)
    })
    var albumQueue = new spotify.Queue(albums)
    return albumQueue.dispatch()
  }
}

/**
 * Dispatch entry.
 * @return {Promise | spotify.Queue} A queue of tracks.
 */
spotify.Artist.prototype.dispatch = function () {
  var self = this
  if (self.limit) {
    return this.searchForArtist(this.entry).then(function () {
      return self.fetchTopTracks()
    }).then(function (response) {
      return self.createQueue(response)
    })
  } else {
    return this.searchForArtist(this.entry).then(function () {
      return self.fetchAlbums()
    }).then(function (response) {
      return self.createQueue(response)
    })
  }
}

/**
 * Fetch albums.
 * @return {Promise | JSON} A JSON response.
 */
spotify.Artist.prototype.fetchAlbums = function () {
  var id = this.id()
  var url = 'https://api.spotify.com/v1/artists/'
  url += encodeURIComponent(id) + '/albums'
  var self = this
  return spotify.request(url).then(function (response) {
    if (self.isAlbumsResponse(response)) {
      self.albumsResponse = response
      return Promise.resolve(response)
    } else {
      return Promise.reject(response)
    }
  })
}

/**
 * Fetch top tracks.
 * @return {Promise | JSON} A JSON response.
 */
spotify.Artist.prototype.fetchTopTracks = function () {
  var id = this.id()
  var url = 'https://api.spotify.com/v1/artists/'
  url += encodeURIComponent(id) + '/top-tracks?country=US'
  var self = this
  return spotify.request(url).then(function (response) {
    if (self.isTopTracksResponse(response)) {
      self.topTracksResponse = response
      return Promise.resolve(response)
    } else {
      return Promise.reject(response)
    }
  })
}

/**
 * Spotify ID.
 * @return {string} The Spotify ID of the artist,
 * or `-1` if not available.
 */
spotify.Artist.prototype.id = function () {
  if (this.artistResponse &&
      this.artistResponse.artists &&
      this.artistResponse.artists.items[0] &&
      this.artistResponse.artists.items[0].id) {
    return this.artistResponse.artists.items[0].id
  } else {
    return -1
  }
}

/**
 * Whether a JSON response is an albums response.
 * @param {JSON} response - A JSON response object.
 * @return {boolean} `true` if `response` is an albums response,
 * `false` otherwise.
 */
spotify.Artist.prototype.isAlbumsResponse = function (response) {
  return response &&
    response.items
}

/**
 * Whether a JSON response is an artist search response.
 * @param {JSON} response - A JSON response object.
 * @return {boolean} `true` if `response` is an artist search response,
 * `false` otherwise.
 */
spotify.Artist.prototype.isSearchResponse = function (response) {
  return response &&
    response.artists &&
    response.artists.items[0] &&
    response.artists.items[0].id
}

/**
 * Whether a JSON response is a top tracks response.
 * @param {JSON} response - A JSON response object.
 * @return {boolean} `true` if `response` is a top tracks response,
 * `false` otherwise.
 */
spotify.Artist.prototype.isTopTracksResponse = function (response) {
  return response &&
    response.tracks
}

/**
 * Search for artist.
 * @param {string} query - The query text.
 * @return {Promise | JSON} A JSON response.
 */
spotify.Artist.prototype.searchForArtist = function (query) {
  // https://developer.spotify.com/web-api/search-item/
  var url = 'https://api.spotify.com/v1/search?type=artist&q='
  url += encodeURIComponent(query)
  var self = this
  return spotify.request(url).then(function (response) {
    if (self.isSearchResponse(response)) {
      self.artistResponse = response
      return Promise.resolve(response)
    } else {
      return Promise.reject(response)
    }
  })
}

/**
 * Set the number of tracks to fetch.
 * @param {integer} limit - The maximum amount of tracks.
 */
spotify.Artist.prototype.setLimit = function (limit) {
  if (Number.isInteger(limit)) {
    this.limit = limit
  }
}

/**
 * Create a playlist.
 * @constructor
 * @param {string} str - A newline-separated string of
 * entries on the form `TITLE - ARTIST`. May also contain
 * `#ALBUM`, `#ARTIST`, `#ORDER` and `#GROUP` directives.
 */
spotify.Playlist = function (str) {
  /**
   * List of entries.
   */
  this.entries = new spotify.Queue()

  /**
   * Playlist grouping.
   */
  this.grouping = null

  /**
   * Playlist order.
   */
  this.ordering = null

  /**
   * Whether to remove duplicates.
   */
  this.unique = true

  str = str.trim()
  if (str !== '') {
    var lines = str.split(/\r|\n|\r\n/)
    while (lines.length > 0) {
      var line = lines.shift()
      if (line.match(/^#ORDER BY POPULARITY/i)) {
        this.ordering = 'popularity'
      } else if (line.match(/^#(SORT|ORDER)\s+BY\s+LAST.?FM/i)) {
        this.ordering = 'lastfm'
      } else if (line.match(/^#GROUP\s+BY\s+ENTRY/i)) {
        this.grouping = 'entry'
      } else if (line.match(/^#GROUP\s+BY\s+ARTIST/i)) {
        this.grouping = 'artist'
      } else if (line.match(/^#GROUP\s+BY\s+ALBUM/i)) {
        this.grouping = 'album'
      } else if (line.match(/^#UNIQUE/i)) {
        this.unique = true
      } else if (line.match(/^##/i) ||
                 line.match(/^#EXTM3U/i)) {
        // comment
      } else if (line.match(/^#ALBUM[0-9]*\s+/i)) {
        var albumMatch = line.match(/^#ALBUM([0-9]*)\s+(.*)/i)
        var albumLimit = parseInt(albumMatch[1])
        var albumEntry = albumMatch[2]
        var album = new spotify.Album(albumEntry)
        album.setLimit(albumLimit)
        this.entries.add(album)
      } else if (line.match(/^#(ARTIST|TOP)[0-9]*\s+/i)) {
        var artistMatch = line.match(/^#(ARTIST|TOP)([0-9]*)\s+(.*)/i)
        var artistLimit = parseInt(artistMatch[2])
        var artistEntry = artistMatch[3]
        var artist = new spotify.Artist(artistEntry)
        artist.setLimit(artistLimit)
        this.entries.add(artist)
      } else if (line.match(/^#EXTINF/i)) {
        var match = line.match(/^#EXTINF:[0-9]+,(.*)/i)
        if (match) {
          this.entries.add(new spotify.Track(match[1]))
          if (lines.length > 0 &&
              !lines[0].match(/^#/)) {
            lines.shift()
          }
        }
      } else if (line !== '') {
        var track = new spotify.Track(line)
        this.entries.add(track)
      }
    }
  }
}

/**
 * Remove duplicate entries.
 */
spotify.Playlist.prototype.dedup = function () {
  if (this.unique) {
    this.entries.dedup()
  }
}

/**
 * Dispatch all the entries in the playlist
 * and return the track listing.
 * @return {Promise | string} A newline-separated list
 * of Spotify URIs.
 */
spotify.Playlist.prototype.dispatch = function () {
  var self = this
  return this.fetchTracks().then(function () {
    return self.dedup()
  }).then(function () {
    return self.order()
  }).then(function () {
    return self.group()
  }).then(function () {
    return self.toString()
  })
}

/**
 * Fetch Last.fm metadata of each playlist entry.
 * @return {Promise | spotify.Playlist} Itself.
 */
spotify.Playlist.prototype.fetchLastfm = function () {
  var self = this
  return this.entries.resolveAll(function (entry) {
    return entry.fetchLastfm()
  }).then(function (result) {
    return self
  })
}

/**
 * Dispatch the entries in the playlist.
 * @return {Promise | spotify.Playlist} Itself.
 */
spotify.Playlist.prototype.fetchTracks = function () {
  var self = this
  return this.entries.dispatch().then(function (result) {
    self.entries = result.flatten()
    return self
  })
}

/**
 * Group the playlist entries.
 */
spotify.Playlist.prototype.group = function () {
  if (this.grouping === 'artist') {
    return this.groupByArtist()
  } else if (this.grouping === 'album') {
    return this.refreshTracks().then(function () {
      return this.groupByAlbum()
    })
  } else if (this.grouping === 'entry') {
    return this.groupByEntry()
  }
}

/**
 * Group the playlist entries by album.
 */
spotify.Playlist.prototype.groupByAlbum = function () {
  this.entries.group(function (track) {
    return track.album().toLowerCase()
  })
}

/**
 * Group the playlist entries by artist.
 */
spotify.Playlist.prototype.groupByArtist = function () {
  this.entries.group(function (track) {
    return track.artist().toLowerCase()
  })
}

/**
 * Group the playlist entries by entry.
 */
spotify.Playlist.prototype.groupByEntry = function () {
  this.entries.group(function (track) {
    return track.entry.toLowerCase()
  })
}

/**
 * Order the playlist entries.
 * @return {Promise | spotify.Playlist} Itself.
 */
spotify.Playlist.prototype.order = function () {
  var self = this
  if (this.ordering === 'popularity') {
    return this.refreshTracks().then(function () {
      return self.orderByPopularity()
    })
  } else if (this.ordering === 'lastfm') {
    return this.fetchLastfm().then(function () {
      return self.orderByLastfm()
    })
  }
}

/**
 * Order the playlist entries by Last.fm playcount.
 */
spotify.Playlist.prototype.orderByLastfm = function () {
  this.entries.sort(function (a, b) {
    var x = a.lastfm()
    var y = b.lastfm()
    var val = (x < y) ? 1 : ((x > y) ? -1 : 0)
    return val
  })
}

/**
 * Order the playlist entries by Spotify popularity.
 */
spotify.Playlist.prototype.orderByPopularity = function () {
  this.entries.sort(function (a, b) {
    var x = a.popularity()
    var y = b.popularity()
    var val = (x < y) ? 1 : ((x > y) ? -1 : 0)
    return val
  })
}

/**
 * Print the playlist to the console.
 */
spotify.Playlist.prototype.print = function () {
  console.log(this.toString())
}

/**
 * Refresh the metadata of each playlist entry.
 * @return {Promise | spotify.Playlist} Itself.
 */
spotify.Playlist.prototype.refreshTracks = function () {
  var self = this
  return this.entries.dispatch().then(function (result) {
    self.entries = result.flatten()
    return self
  })
}

/**
 * Convert the playlist to a string.
 * @return {string} A newline-separated list of Spotify URIs.
 */
spotify.Playlist.prototype.toString = function () {
  var result = ''
  this.entries.forEach(function (track) {
    if (track instanceof spotify.Track) {
      console.log(track.toString())
      console.log(track.lastfm())
      var uri = track.uri()
      if (uri !== '') {
        result += uri + '\n'
      }
    }
  })
  return result.trim()
}

/**
 * Create a queue of playlist entries.
 * @constructor
 * @param {Array} [arr] - An array of playlist entries.
 */
spotify.Queue = function (arr) {
  /**
   * Array of entries.
   */
  this.queue = []

  if (arr) {
    this.queue = arr
  }
}

/**
 * Add an entry to the end of the queue.
 * @param {spotify.Track | spotify.Album | spotify.Artist} entry -
 * The entry to add.
 */
spotify.Queue.prototype.add = function (entry) {
  this.queue.push(entry)
}

/**
 * Concatenate with another queue.
 * @param {spotify.Queue} queue - Another queue to append to this queue.
 * @return {spotify.Queue} - A new queue containing all the entries
 * from this queue followed by all the entries from the other queue.
 */
spotify.Queue.prototype.concat = function (queue) {
  return new spotify.Queue(this.toArray().concat(queue.toArray()))
}

/**
 * Whether the queue contains an entry.
 * @param {spotify.Track | spotify.Album | spotify.Artist} entry -
 * The entry to check for.
 * @return {boolean} - `true` is the queue contains `entry`,
 * `false` otherwise.
 */
spotify.Queue.prototype.contains = function (obj) {
  for (var i in this.queue) {
    var entry = this.queue[i]
    if ((entry && entry.equals &&
         obj && obj.equals &&
         entry.equals(obj)) ||
        entry === obj) {
      return true
    }
  }
  return false
}

/**
 * Remove duplicate entries.
 * @return {spotify.Queue} - Itself.
 */
spotify.Queue.prototype.dedup = function () {
  var result = new spotify.Queue()
  this.queue.forEach(function (entry) {
    if (!result.contains(entry)) {
      result.add(entry)
    }
  })
  this.queue = result.toArray()
  return this
}

/**
 * Dispatch all entries in sequence.
 * Ensure that only one entry is dispatched at a time.
 * @return {Promise | spotify.Queue} A queue of results.
 */
spotify.Queue.prototype.dispatch = function () {
  return this.resolveAll(function (entry) {
    return entry.dispatch()
  })
}

/**
 * Transform a nested queue into a flat queue.
 * @return {spotify.Queue} - Itself.
 */
spotify.Queue.prototype.flatten = function () {
  var result = []
  for (var i in this.queue) {
    var entry = this.queue[i]
    if (entry instanceof spotify.Queue) {
      entry = entry.flatten()
      result = result.concat(entry.queue)
    } else {
      result.push(entry)
    }
  }
  this.queue = result
  return this
}

/**
 * Iterate over the queue.
 * @param {Function} fn - An iterator function.
 * Takes the current entry as input and returns
 * the modified value as output.
 * @return {spotify.Queue} - Itself.
 */
spotify.Queue.prototype.forEach = function (fn) {
  this.queue.forEach(fn)
  return this
}

/**
 * Get a playlist entry.
 * @param {integer} idx - The index of the entry.
 * The indices start at 0.
 */
spotify.Queue.prototype.get = function (idx) {
  return this.queue[idx]
}

/**
 * Group entries.
 * @param {Function} fn - A grouping function.
 * Takes an entry as input and returns a grouping key,
 * a string, as output.
 * @return {spotify.Queue} - Itself.
 */
spotify.Queue.prototype.group = function (fn) {
  var map = []
  var result = []
  for (var i in this.queue) {
    var entry = this.queue[i]
    var key = fn(entry)

    if (!map[key]) {
      map[key] = []
    }
    map[key].push(entry)
  }
  for (var k in map) {
    result = result.concat(map[k])
  }
  this.queue = result
  return this
}

/**
 * Map a function over the queue.
 * @param {Function} fn - An iterator function.
 * Takes the current entry as input and returns
 * the modified value as output.
 * @return {spotify.Queue} - A new queue.
 */
spotify.Queue.prototype.map = function (fn) {
  return new spotify.Queue(this.toArray().map(fn))
}

/**
 * Resolve all entries in sequence.
 * Ensure that only one entry is resolved at a time.
 * @param {Function} fn - A resolving function.
 * Takes an entry as input and invokes a Promise-returning
 * method on it.
 * @return {Promise | spotify.Queue} A queue of results.
 */
spotify.Queue.prototype.resolveAll = function (fn) {
  // we could have used Promise.all(), but we choose to roll our
  // own, sequential implementation to avoid overloading the server
  var result = new spotify.Queue()
  var ready = Promise.resolve(null)
  this.queue.forEach(function (entry) {
    ready = ready.then(function () {
      return fn(entry)
    }).then(function (value) {
      result.add(value)
    }, function () { })
  })
  return ready.then(function () {
    return result
  })
}

/**
 * The playlist size.
 * @return {integer} - The number of entries.
 */
spotify.Queue.prototype.size = function () {
  return this.queue.length
}

/**
 * Slice a queue.
 * @param {integer} start - The index of the first element.
 * @param {integer} end - The index of the last element (not included).
 * @return {spotify.Queue} - A new queue containing all elements
 * from `start` (inclusive) to `end` (exclusive).
 */

spotify.Queue.prototype.slice = function (start, end) {
  return new spotify.Queue(this.toArray().slice(start, end))
}

/**
 * Sort the queue.
 * @param {Function} fn - A sorting function.
 * Takes two entries as input and returns
 * `-1` if the first entry is less than the second,
 * `1` if the first entry is greater than the second, and
 * `0` if the entries are equal.
 * @return {spotify.Queue} - Itself.
 */
spotify.Queue.prototype.sort = function (fn) {
  this.queue = this.queue.sort(fn)
  return this
}

/**
 * Convert queue to array.
 * @return {Array} An array of playlist entries.
 */
spotify.Queue.prototype.toArray = function () {
  return this.queue
}

/**
 * Perform a Spotify request.
 * @param {string} url - The URL to look up.
 */
spotify.request = function (url) {
  return new Promise(function (resolve, reject) {
    setTimeout(function () {
      console.log(url)
      request(url, function (err, response, body) {
        if (err) {
          reject(err)
        } else if (response.statusCode !== 200) {
          reject(response.statusCode)
        } else {
          try {
            body = JSON.parse(body)
          } catch (e) {
            reject(e)
          }
          if (body.error) {
            reject(body)
          } else {
            resolve(body)
          }
        }
      })
    }, 100)
  })
}

/**
 * Create track entry.
 * @constructor
 * @param {string} entry - The track to search for.
 * @param {JSON} [response] - Track response object.
 * Should have the property `popularity`.
 * @param {JSON} [responseSimple] - Simplified track response object.
 */
spotify.Track = function (entry, response) {
  /**
   * Entry string.
   */
  this.entry = entry.trim()

  /**
   * Full track object.
   */
  this.response = null

  /**
   * Simplified track object.
   */
  this.responseSimple = null

  if (this.isFullResponse(response)) {
    this.response = response
  } else {
    this.responseSimple = response
  }
}

/**
 * Track album.
 * @return {string} The track album,
 * or the empty string if not available.
 */
spotify.Track.prototype.album = function () {
  if (this.response &&
      this.response.album &&
      this.response.album.name) {
    return this.response.album.name
  } else {
    return ''
  }
}

/**
 * Track main artist.
 * @return {string} The main artist.
 */
spotify.Track.prototype.artist = function () {
  var response = this.response || this.responseSimple
  if (response &&
      response.artists &&
      response.artists[0] &&
      response.artists[0].name) {
    return response.artists[0].name.trim()
  } else {
    return ''
  }
}

/**
 * Track artists.
 * @return {string} All the track artists, separated by `, `.
 */
spotify.Track.prototype.artists = function () {
  var artists = []
  var response = this.response || this.responseSimple
  if (response &&
      response.artists) {
    artists = this.response.artists.map(function (artist) {
      return artist.name.trim()
    })
  }
  return artists.join(', ')
}

/**
 * Dispatch entry.
 * @return {Promise | spotify.Track} Itself.
 */
spotify.Track.prototype.dispatch = function () {
  if (this.response) {
    return Promise.resolve(this)
  } else if (this.responseSimple) {
    return this.fetchTrack()
  } else if (this.isURI(this.entry)) {
    return this.fetchTrack()
  } else if (this.isLink(this.entry)) {
    return this.fetchTrack()
  } else {
    return this.searchForTrack(this.entry)
  }
}

/**
 * Whether this track is identical to another track.
 * @param {spotify.Track} track - The track to compare against.
 * @return {boolean} `true` if the tracks are identical,
 * `false` otherwise.
 */
spotify.Track.prototype.equals = function (track) {
  var str1 = this.toString().toLowerCase()
  var str2 = track.toString().toLowerCase()
  return str1 === str2
}

/**
 * Fetch Last.fm information.
 * @return {Promise | spotify.Track} Itself.
 */
spotify.Track.prototype.fetchLastfm = function () {
  var artist = this.artist()
  var title = this.title()
  var self = this
  return lastfm.getInfo(artist, title).then(function (result) {
    self.lastfmResponse = result
    return self
  })
}

/**
 * Fetch track metadata.
 * @return {Promise | spotify.Track} Itself.
 */
spotify.Track.prototype.fetchTrack = function () {
  var id = this.id()
  var url = 'https://api.spotify.com/v1/tracks/'
  url += encodeURIComponent(id)
  var self = this
  return spotify.request(url).then(function (result) {
    self.response = result
    return self
  })
}

/**
 * Spotify ID.
 * @return {string} The Spotify ID of the track,
 * or `-1` if not available.
 */
spotify.Track.prototype.id = function () {
  if (this.response &&
      this.response.id) {
    return this.response.id
  } else if (this.responseSimple &&
             this.responseSimple.id) {
    return this.responseSimple.id
  } else if (this.isURI(this.entry)) {
    return this.entry.substring(14)
  } else if (this.isLink(this.entry)) {
    return this.entry.split('/')[4]
  } else {
    return -1
  }
}

/**
 * Whether a track object is full or simplified.
 * A full object includes information (like popularity)
 * that a simplified object does not.
 */
spotify.Track.prototype.isFullResponse = function (response) {
  return response && response.popularity
}

/**
 * Whether a string is a Spotify link
 * on the form `http://open.spotify.com/track/ID`.
 * @param {string} str - A potential Spotify link.
 * @return {boolean} `true` if `str` is a link, `false` otherwise.
 */
spotify.Track.prototype.isLink = function (str) {
  return str.match(/^https?:\/\/open\.spotify\.com\/track\//i)
}

/**
 * Whether a string is a Spotify URI
 * on the form `spotify:track:xxxxxxxxxxxxxxxxxxxxxx`.
 * @return {boolean} `true`
 * or `-1` if not available.
 */
spotify.Track.prototype.isURI = function (str) {
  return str.match(/^spotify:track:/i)
}

/**
 * Last.fm playcount.
 * @return {integer} The playcount, or `-1` if not available.
 */
spotify.Track.prototype.lastfm = function () {
  if (this.lastfmResponse) {
    return parseInt(this.lastfmResponse.track.playcount)
  } else {
    return -1
  }
}

/**
 * Full track name.
 * @return {string} The track name, on the form `Title - Artist`.
 */
spotify.Track.prototype.name = function () {
  var title = this.title()
  if (title !== '') {
    var artist = this.artist()
    if (artist !== '') {
      return title + ' - ' + artist
    } else {
      return title
    }
  } else {
    return ''
  }
}

/**
 * Spotify popularity.
 * @return {int} The Spotify popularity, or `-1` if not available.
 */
spotify.Track.prototype.popularity = function () {
  if (this.response) {
    return this.response.popularity
  } else {
    return -1
  }
}

/**
 * Search for track.
 * @param {string} query - The query text.
 * @return {Promise | spotify.Track} Itself.
 */
spotify.Track.prototype.searchForTrack = function (query) {
  // https://developer.spotify.com/web-api/search-item/
  var url = 'https://api.spotify.com/v1/search?type=track&q='
  url += encodeURIComponent(query)
  var self = this
  return spotify.request(url).then(function (result) {
    if (result.tracks &&
        result.tracks.items[0] &&
        result.tracks.items[0].uri) {
      self.responseSimple = result.tracks.items[0]
      return self
    }
  })
}

/**
 * Track title.
 * @return {string} The track title.
 */
spotify.Track.prototype.title = function () {
  var response = this.response || this.responseSimple
  if (response &&
      response.name) {
    return response.name
  } else {
    return ''
  }
}

/**
 * Full track title.
 * @return {string} The track title, on the form `Title - Artist`.
 */
spotify.Track.prototype.toString = function () {
  var name = this.name()
  if (name !== '') {
    return name
  } else {
    return this.entry
  }
}

/**
 * Spotify URI.
 * @return {string} The Spotify URI
 * (a string on the form `spotify:track:xxxxxxxxxxxxxxxxxxxxxx`),
 * or the empty string if not available.
 */
spotify.Track.prototype.uri = function () {
  if (this.response) {
    return this.response.uri
  } else if (this.responseSimple) {
    return this.responseSimple.uri
  } else {
    return ''
  }
}

module.exports = spotify