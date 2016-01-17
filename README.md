## image-interestingness

image-interestingness calculates a score for an image that includes the image's
saturation and detail. It is based on Jonas Wanger's
[smartcrop.js](https://github.com/jwagner/smartcrop.js).

### Usage

```js
var ImageInterestingness = require('image-interestingness');
var interestingness = new ImageInterestingness();

var result = interestingness.analyzeFile('./test.png');
//= {detail: ..., saturation: ..., total: ...}
```
