/* global jQuery:true */
/* exported jQuery */

var http = require('./http')
var util = require('./util')
var URI = require('urijs')
var $ = require('jquery')
jQuery = $

/**
 * Create a web scraper.
 * @constructor
 * @param {string} uri - The URI of the web page to scrape.
 */
function WebScraper (uri, parser) {
  this.uri = uri

  this.parser = parser
}

/**
 * Scrape a web page.
 *
 * This function inspects the host of the web page and invokes an
 * appropriate scraping function. The scraping functions are written
 * in the following manner: they take the web page URI as input,
 * fetch the page, and return a generator string as output (wrapped
 * in a Promise). Schematically:
 *
 *           web page:                      generator string
 *     +-------------------+                   (Promise):
 *     | track1 by artist1 |    scraping
 *     +-------------------+    function    artist1 - track1
 *     | track2 by artist2 |    =======>    artist2 - track2
 *     +-------------------+                artist3 - track3
 *     | track3 by artist3 |
 *     +-------------------+
 *
 * In the example above, the scraping function converts a table of
 * tracks to a generator string on the form `ARTIST - TRACK`. If the
 * input were an albums chart, then the output would be a string of
 * `#album` commands instead. In other words, the scraping function
 * should extract the *meaning* of the web page and express it as
 * input to the generator.
 *
 * @param {string} uri - The URI of the web page to scrape.
 * @return {Promise | string} A generator string.
 */
WebScraper.prototype.scrape = function (uri) {
  var domain = URI(uri).domain()
  if (domain === 'last.fm') {
    return this.lastfm(uri)
  } else if (domain === 'pitchfork.com') {
    return this.pitchfork(uri)
  } else if (domain === 'rateyourmusic.com') {
    return this.rateyourmusic(uri)
  } else if (domain === 'reddit.com') {
    return this.reddit(uri)
  } else if (domain === 'youtube.com') {
    return this.youtube(uri)
  } else {
    return this.webpage(uri)
  }
}

/**
 * Create a queue of tracks.
 * @param {string} result - A newline-separated list of tracks.
 * @return {Promise | Queue} A queue of results.
 */
WebScraper.prototype.createQueue = function (result) {
  var generator = this.parser.parse(result)
  return generator.dispatch()
}

/**
 * Dispatch entry.
 * @return {Promise | Queue} A queue of results.
 */
WebScraper.prototype.dispatch = function () {
  var self = this
  console.log(this.uri)
  return this.scrape(this.uri).then(function (result) {
    console.log(result)
    return self.createQueue(result)
  })
}

/**
 * Clean up a string's contents.
 * @return {string} A new string.
 */
WebScraper.prototype.cleanup = function (str) {
  str = str.replace(/].*/gi, ']')
    .replace(/\).*/gi, ')')
    .replace(/\[[^\]]*]/gi, '')
    .replace(/\([^)]*\)/gi, '')
    .replace(/-+/gi, '-')
    .replace(/\.+/gi, '.')
    .replace(/[^-'.\w\s]/gi, '')
  str = this.trim(str)
  return str
}

/**
 * Clean up a string's whitespace.
 * @return {string} A new string.
 */
WebScraper.prototype.trim = function (str) {
  str = str || ''
  str = str.trim()
  str = str.replace(/[\s]+/g, ' ')
  str = util.toAscii(str)
  return str
}

/**
 * Scrape a Last.fm tracklist.
 * @param {string} uri - The URI of the web page to scrape.
 * @return {Promise | string} A newline-separated list of tracks.
 */
WebScraper.prototype.lastfm = function (uri) {
  var self = this
  return http(uri).then(function (data) {
    var html = $($.parseHTML(data))
    var result = ''
    if (uri.match(/\/\+tracks/gi)) {
      // tracks by a single artist
      var header = html.find('header a.library-header-crumb')
      if (header.length === 0) {
        header = html.find('h1.header-title')
      }
      var artist = self.trim(header.first().text())
      html.find('td.chartlist-name').each(function () {
        result += artist + ' - ' + self.trim($(this).text()) + '\n'
      })
    } else if (uri.match(/\/\+similar/gi)) {
      // similar artists
      html.find('h3.big-artist-list-title').each(function () {
        result += '#top ' + self.trim($(this).text()) + '\n'
      })
    } else if (uri.match(/\/artists/gi)) {
      // list of artists
      html.find('td.chartlist-name').each(function () {
        result += '#top ' + self.trim($(this).text()) + '\n'
      })
    } else if (uri.match(/\/albums/gi)) {
      // list of albums
      html.find('td.chartlist-name').each(function () {
        result += '#album ' + self.trim($(this).text()) + '\n'
      })
    } else {
      // list of tracks by various artists
      html.find('td.chartlist-name').each(function () {
        result += self.trim($(this).text()) + '\n'
      })
    }
    return result.trim()
  })
}

/**
 * Scrape a Pitchfork list.
 * @param {string} uri - The URI of the web page to scrape.
 * @return {Promise | string} A newline-separated list of albums.
 */
WebScraper.prototype.pitchfork = function (uri) {
  var self = this
  function getPages (nextUri, result) {
    nextUri = URI(nextUri).absoluteTo(uri).toString()
    return http(nextUri).then(function (data) {
      var html = $($.parseHTML(data))
      html.find('div.artist-work').each(function () {
        var artist = self.trim($(this).find('ul.artist-list li:first').text())
        var album = self.trim($(this).find('h2.work-title').text())
        result += '#album ' + artist + ' - ' + album + '\n'
      })
      var nextPage = html.find('.fts-pagination__list-item--active').next()
      if (nextPage.length > 0) {
        nextUri = nextPage.find('a').attr('href')
        return getPages(nextUri, result)
      } else {
        return result.trim()
      }
    })
  }
  return getPages(uri, '')
}

/**
 * Scrape a Rate Your Music chart.
 * @param {string} uri - The URI of the web page to scrape.
 * @return {Promise | string} A newline-separated list of albums.
 */
WebScraper.prototype.rateyourmusic = function (uri) {
  var self = this
  return http(uri).then(function (data) {
    var html = $($.parseHTML(data))
    var result = ''
    html.find('div.chart_details').each(function () {
      var artist = self.trim($(this).find('a.artist').text())
      var album = self.trim($(this).find('a.album').text())
      result += '#album ' + artist + ' - ' + album + '\n'
    })
    return result.trim()
  })
}

/**
 * Scrape a Reddit forum.
 *
 * Handles post listing and comment threads. Employs Bob Nisco's
 * heuristic for parsing comments.
 *
 * @param {string} uri - The URI of the web page to scrape.
 * @return {Promise | string} A newline-separated list of tracks.
 */
WebScraper.prototype.reddit = function (uri) {
  var self = this
  return http(uri).then(function (data) {
    var html = $($.parseHTML(data))
    var result = ''
    if (uri.match(/\/comments\//gi)) {
      // comments thread
      html.find('div.usertext-body div.md, div.commentarea div.md').each(function () {
        // first assumption: if there are links,
        // they are probably links to songs
        var links = $(this).find('a')
        if (links.length > 0) {
          links.each(function () {
            result += self.cleanup($(this).text()) + '\n'
          })
          return
        }
        // second assumption: if there are multiple sentences,
        // the song is the first one
        var body = $(this).text()
        var sentences = body.split('.')
        if (sentences.length > 1) {
          result += self.cleanup(sentences[0]) + '\n'
          return
        }
        // third assumption: if there are multiple lines to a comment,
        // then the song will be on the first line with a user's
        // comments on other lines after it
        var lines = body.split('\n')
        if (lines.length > 1) {
          result += self.cleanup(lines[0]) + '\n'
          return
        }
        // fall-back case
        result += self.cleanup(body) + '\n'
      })
    } else {
      // post listing
      html.find('a.title').each(function () {
        var track = self.cleanup($(this).text())
        result += track + '\n'
      })
    }
    return result.trim()
  })
}

/**
 * Scrape a web page.
 *
 * This is a fall-back function in case none of the other
 * scraping functions apply.
 *
 * @param {string} uri - The URI of the web page to scrape.
 * @return {Promise | string} A newline-separated list of tracks.
 */
WebScraper.prototype.webpage = function (uri) {
  var self = this
  return http(uri).then(function (data) {
    var html = $($.parseHTML(data))
    var result = ''
    html.find('a').each(function () {
      var track = self.cleanup($(this).text())
      result += track + '\n'
    })
    return result.trim()
  })
}

/**
 * Scrape a YouTube playlist.
 * @param {string} uri - The URI of the web page to scrape.
 * @return {Promise | string} A newline-separated list of tracks.
 */
WebScraper.prototype.youtube = function (uri) {
  var self = this
  return http(uri).then(function (data) {
    var html = $($.parseHTML(data))
    var result = ''
    html.find('div.playlist-video-description h4, a.pl-video-title-link').each(function () {
      var track = self.cleanup($(this).text())
      result += track + '\n'
    })
    return result.trim()
  })
}

module.exports = WebScraper
