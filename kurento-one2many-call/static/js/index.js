/*
 * (C) Copyright 2014-2015 Kurento (http://kurento.org/)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 */

var ws = new WebSocket('wss://' + location.host + '/one2many');
var video;
var webRtcPeer;
var presenters = [];
var webRtcPeerViewers = {};
let currentPresenterId = null
let peerConnection = null

window.onload = function () {
    console = new Console();
    video = document.getElementById('video');

    document.getElementById('call').addEventListener('click', function () {
        presenter();
    });
    document.getElementById('viewer').addEventListener('click', function () {
        registerViewer();
    });
    document.getElementById('terminate').addEventListener('click', function () {
        stop();
    });
}

window.onbeforeunload = function () {
    ws.close();
}

ws.onmessage = function (message) {
    var parsedMessage = JSON.parse(message.data);
    console.info('Received message: ' + message.data);

    switch (parsedMessage.id) {
        case 'presenterResponse':
            presenterResponse(parsedMessage);
            break;
        case 'viewerResponse':
            viewerResponse(parsedMessage);
            break;
        case 'stopCommunication':
            dispose();
            break;
        case 'iceCandidatePresenter':
            webRtcPeer.addIceCandidate(parsedMessage.candidate)
            break;
        case 'iceCandidateViewer':
            try {
                webRtcPeerViewers[currentPresenterId].addIceCandidate(parsedMessage.candidate)
            } catch (e) {
                console.log(e)
            }

            break;
        case 'presenterIds':
            console.log('parsedMessage', parsedMessage);
            presenters = parsedMessage.presenterIds;
            viewer(true);
            break;
        case 'newPresenter':
            presenters.push(parsedMessage.presenterId);
            viewer();
        default:
            console.error('Unrecognized message', parsedMessage);
    }
}

function presenterResponse(message) {
    if (message.response != 'accepted') {
        var errorMsg = message.message ? message.message : 'Unknow error';
        console.warn('Call not accepted for the following reason: ' + errorMsg);
        dispose();
    } else {
        webRtcPeer.processAnswer(message.sdpAnswer);
    }
}

function viewerResponse(message) {
    if (message.response != 'accepted') {
        var errorMsg = message.message ? message.message : 'Unknow error';
        console.warn('Call not accepted for the following reason: ' + errorMsg);
        dispose();
    } else {
        webRtcPeerViewers[currentPresenterId].processAnswer(message.sdpAnswer);
    }
}

function presenter() {
    if (!webRtcPeer) {
        showSpinner(video);
        video.onplay = function () {
            peerConnection = webRtcPeer.peerConnection
          registerViewer()
        };

        var options = {
            localVideo: video,
            onicecandidate: onIceCandidate,
            configuration: {
                iceServers: [{
                    "urls": ["turn:frankfurt-2.turn.rpturn.com"],
                    "username": "1581963600:eff9d4fa-708f-4e94-a7ad-25421fa48bba",
                    "credential": "Axr8phXnuU7EFimMrhi38NI7qG8="
                }, {
                    "urls": ["stun:frankfurt-2.turn.rpturn.com"],
                    "username": "1581963600:eff9d4fa-708f-4e94-a7ad-25421fa48bba",
                    "credential": "Axr8phXnuU7EFimMrhi38NI7qG8="
                }]
            }
        }

        webRtcPeer = kurentoUtils.WebRtcPeer.WebRtcPeerSendonly(options, function (error) {
            if (error) return onError(error);

            this.generateOffer(onOfferPresenter);
            console.log(webRtcPeer)
        });
    }
}

function onOfferPresenter(error, offerSdp) {
    if (error) return onError(error);

    var message = {
        id: 'presenter',
        sdpOffer: offerSdp
    };
    sendMessage(message);
}

function registerViewer() {
    var message = {
        id: 'presenterIds'
    };
    sendMessage(message);
}

function viewer(broadcastPresenter) {
    if (presenters.length) {
        let v = document.createElement('video');
        v.muted = "muted";
        v.autoplay = true;
        v.style.maxWidth = '100%';
        v.style.width = '100%';
        v.onplay = function () {
            console.log('PLAYYYY', broadcastPresenter)
            viewer(broadcastPresenter)
        };

        document.getElementById('videoSmall').appendChild(v);
        showSpinner(v);

        var options = {
            remoteVideo: v,
            onicecandidate: onIceCandidate,
            // peerConnection,
            configuration: {
                iceServers: [{
                    "urls": ["turn:frankfurt-2.turn.rpturn.com"],
                    "username": "1581963600:eff9d4fa-708f-4e94-a7ad-25421fa48bba",
                    "credential": "Axr8phXnuU7EFimMrhi38NI7qG8="
                }, {
                    "urls": ["stun:frankfurt-2.turn.rpturn.com"],
                    "username": "1581963600:eff9d4fa-708f-4e94-a7ad-25421fa48bba",
                    "credential": "Axr8phXnuU7EFimMrhi38NI7qG8="
                }]
            }
        }
        let nextPresenterId = presenters.shift();
        currentPresenterId = nextPresenterId;
        webRtcPeerViewers[currentPresenterId] = kurentoUtils.WebRtcPeer.WebRtcPeerRecvonly(options, function (error) {
            if (error) return onError(error);

            this.generateOffer(createOnOfferViewer(nextPresenterId));
        });
    } else {
        if(broadcastPresenter) {
            sendMessage({
                id: 'registerNewPresenter'
            })
        }
    }
}

function createOnOfferViewer(presenterId) {
    return function onOfferViewer(error, offerSdp) {
        if (error) return onError(error)

        var message = {
            id: 'viewer',
            sdpOffer: offerSdp,
            presenterId
        };
        sendMessage(message);
    }
}

function onIceCandidate(candidate) {
    console.log('Local candidate' + JSON.stringify(candidate));

    var message = {
        id: 'onIceCandidate',
        candidate: candidate
    }
    sendMessage(message);
}

function stop() {
    if (webRtcPeer) {
        var message = {
            id: 'stop'
        }
        sendMessage(message);
        dispose();
    }
}

function dispose() {
    if (webRtcPeer) {
        webRtcPeer.dispose();
        webRtcPeer = null;
    }
    hideSpinner(video);
}

function sendMessage(message) {
    var jsonMessage = JSON.stringify(message);
    console.log('Sending message: ' + jsonMessage);
    ws.send(jsonMessage);
}

function showSpinner() {
    for (var i = 0; i < arguments.length; i++) {
        arguments[i].poster = './img/transparent-1px.png';
        arguments[i].style.background = 'center transparent url("./img/spinner.gif") no-repeat';
    }
}

function hideSpinner() {
    for (var i = 0; i < arguments.length; i++) {
        arguments[i].src = '';
        arguments[i].poster = './img/webrtc.png';
        arguments[i].style.background = '';
    }
}

/**
 * Lightbox utility (to display media pipeline image in a modal dialog)
 */
$(document).delegate('*[data-toggle="lightbox"]', 'click', function (event) {
    event.preventDefault();
    $(this).ekkoLightbox();
});
