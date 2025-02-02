let slab_toggle = true; //true = block 1, false = slab 0.5
let full_height = 1.0;


/* The entire block */
class VoxelWorld {
  constructor(options) {
    this.cellSize = options.cellSize;
    this.tileSize = options.tileSize;
    this.tileTextureWidth = options.tileTextureWidth;
    this.tileTextureHeight = options.tileTextureHeight;
    const { cellSize } = this;
    this.cellSliceSize = cellSize * cellSize;
    this.cells = {};
  }
  computeVoxelOffset(x, y, z) {
    const { cellSize, cellSliceSize } = this;
    const voxelX = THREE.MathUtils.euclideanModulo(x, cellSize) | 0;
    const voxelY = THREE.MathUtils.euclideanModulo(y, cellSize) | 0;
    const voxelZ = THREE.MathUtils.euclideanModulo(z, cellSize) | 0;
    return voxelY * cellSliceSize +
      voxelZ * cellSize +
      voxelX;
  }
  // Decide the ID of each cell
  computeCellId(x, y, z) {
    const { cellSize } = this;
    const cellX = Math.floor(x / cellSize);
    const cellY = Math.floor(y / cellSize);
    const cellZ = Math.floor(z / cellSize);
    return `${cellX},${cellY},${cellZ}`;
  }
  getCellForVoxel(x, y, z) {
    return this.cells[this.computeCellId(x, y, z)]
  }
  setVoxel(x, y, z, v) {
    let cell = this.getCellForVoxel(x, y, z);
    if (!cell) {  // Add a voxel of a cell that doesn't exist
      cell = this.addCellForVoxel(x, y, z);
    }
    const voxelOffset = this.computeVoxelOffset(x, y, z);
    cell[voxelOffset] = v;
  }
  //Add a new cell(50*50) for the voxel
  addCellForVoxel(x, y, z) {
    const cellId = this.computeCellId(x, y, z);
    let cell = this.cells[cellId];
    if (!cell) {
      const { cellSize } = this;
      cell = new Uint8Array(cellSize * cellSize * cellSize);
      this.cells[cellId] = cell;
    }
    return cell;
  }

  // return the offset of the cell so find the correct voxel position
  getVoxel(x, y, z) {
    const cell = this.getCellForVoxel(x, y, z);
    if (!cell) {
      return 0;
    }
    const voxelOffset = this.computeVoxelOffset(x, y, z);
    return cell[voxelOffset];
  }
  generateGeometryDataForCell(cellX, cellY, cellZ) {
    const { cellSize, tileSize, tileTextureWidth, tileTextureHeight } = this;
    const positions = [];
    const normals = [];
    const uvs = [];
    const indices = [];
    const startX = cellX * cellSize;
    const startY = cellY * cellSize;
    const startZ = cellZ * cellSize;

    for (let y = 0; y < cellSize; ++y) {
      const voxelY = startY + y;
      for (let z = 0; z < cellSize; ++z) {
        const voxelZ = startZ + z;
        for (let x = 0; x < cellSize; ++x) {
          const voxelX = startX + x;
          const voxel = this.getVoxel(voxelX, voxelY, voxelZ);
          if (voxel) {
            // voxel 0 is sky (empty) so for UVs we start at 0
            const uvVoxel = voxel - 1;
            for (const { dir, corners, uvRow } of VoxelWorld.faces) {
              // make faces
              const ndx = positions.length / 3;
              for (const { pos, uv } of corners) {
                positions.push(pos[0] + x, pos[1] + y, pos[2] + z);
                normals.push(...dir);
                uvs.push(
                  (uvVoxel + uv[0]) * tileSize / tileTextureWidth,
                  1 - (uvRow + 1 - uv[1]) * tileSize / tileTextureHeight);
              }
              indices.push(
                ndx, ndx + 1, ndx + 2,
                ndx + 2, ndx + 1, ndx + 3,
              );
            }
          }
        }
      }
    }
    return {
      positions,
      normals,
      uvs,
      indices,
    };
  }



  /* create a voxel by user click */
  // return the position of intersection and the normal of the face hit
  intersectRay(start, end) {
    let dx = end.x - start.x;
    let dy = end.y - start.y;
    let dz = end.z - start.z;
    const lenSq = dx * dx + dy * dy + dz * dz;
    const len = Math.sqrt(lenSq);

    dx /= len;
    dy /= len;
    dz /= len;

    let t = 0.0;
    let ix = Math.floor(start.x);
    let iy = Math.floor(start.y);
    let iz = Math.floor(start.z);

    const stepX = (dx > 0) ? 1 : -1;
    const stepY = (dy > 0) ? 1 : -1;
    const stepZ = (dz > 0) ? 1 : -1;

    const txDelta = Math.abs(1 / dx);
    const tyDelta = Math.abs(1 / dy);
    const tzDelta = Math.abs(1 / dz);

    const xDist = (stepX > 0) ? (ix + 1 - start.x) : (start.x - ix);
    const yDist = (stepY > 0) ? (iy + 1 - start.y) : (start.y - iy);
    const zDist = (stepZ > 0) ? (iz + 1 - start.z) : (start.z - iz);

    // location of nearest voxel boundary, in units of t
    let txMax = (txDelta < Infinity) ? txDelta * xDist : Infinity;
    let tyMax = (tyDelta < Infinity) ? tyDelta * yDist : Infinity;
    let tzMax = (tzDelta < Infinity) ? tzDelta * zDist : Infinity;

    let steppedIndex = -1;

    // main loop along raycast vector
    while (t <= len) {
      const voxel = this.getVoxel(ix, iy, iz);
      if (voxel) {
        return {
          position: [
            start.x + t * dx,
            start.y + t * dy,
            start.z + t * dz,
          ],
          normal: [
            steppedIndex === 0 ? -stepX : 0,
            steppedIndex === 1 ? -stepY : 0,
            steppedIndex === 2 ? -stepZ : 0,
          ],
          voxel,
        };
      }

      // advance t to next nearest voxel boundary
      if (txMax < tyMax) {
        if (txMax < tzMax) {
          ix += stepX;
          t = txMax;
          txMax += txDelta;
          steppedIndex = 0;
        } else {
          iz += stepZ;
          t = tzMax;
          tzMax += tzDelta;
          steppedIndex = 2;
        }
      } else {
        if (tyMax < tzMax) {
          iy += stepY;
          t = tyMax;
          tyMax += tyDelta;
          steppedIndex = 1;
        } else {
          iz += stepZ;
          t = tzMax;
          tzMax += tzDelta;
          steppedIndex = 2;
        }
      }
    }
    return null;
  }
}

/*  texture atlas setting */
VoxelWorld.faces = [

  { // left
    uvRow: 0,
    dir: [-1, 0, 0,],
    corners: [
      { pos: [0, full_height, 0], uv: [0, 1], },
      { pos: [0, 0, 0], uv: [0, 0], },
      { pos: [0, full_height, 1], uv: [1, 1], },
      { pos: [0, 0, 1], uv: [1, 0], },
    ],
  },
  { // right
    uvRow: 0,
    dir: [1, 0, 0,],
    corners: [
      { pos: [1, full_height, 1], uv: [0, 1], },
      { pos: [1, 0, 1], uv: [0, 0], },
      { pos: [1, full_height, 0], uv: [1, 1], },
      { pos: [1, 0, 0], uv: [1, 0], },
    ],
  },
  { // bottom
    uvRow: 1,
    dir: [0, -1, 0,],
    corners: [
      { pos: [1, 0, 1], uv: [1, 0], },
      { pos: [0, 0, 1], uv: [0, 0], },
      { pos: [1, 0, 0], uv: [1, 1], },
      { pos: [0, 0, 0], uv: [0, 1], },
    ],
  },
  { // top
    uvRow: 2,
    dir: [0, 1, 0,],
    corners: [
      { pos: [0, full_height, 1], uv: [1, 1], },
      { pos: [1, full_height, 1], uv: [0, 1], },
      { pos: [0, full_height, 0], uv: [1, 0], },
      { pos: [1, full_height, 0], uv: [0, 0], },
    ],
  },
  { // back
    uvRow: 0,
    dir: [0, 0, -1,],
    corners: [
      { pos: [1, 0, 0], uv: [0, 0], },
      { pos: [0, 0, 0], uv: [1, 0], },
      { pos: [1, full_height, 0], uv: [0, 1], },
      { pos: [0, full_height, 0], uv: [1, 1], },
    ],
  },
  { // front
    uvRow: 0,
    dir: [0, 0, 1,],
    corners: [
      { pos: [0, 0, 1], uv: [0, 0], },
      { pos: [1, 0, 1], uv: [1, 0], },
      { pos: [0, full_height, 1], uv: [0, 1], },
      { pos: [1, full_height, 1], uv: [1, 1], },
    ],
  },
];

/* texture ui(inventory) */
const textureNum = 16;
function main() {
  const canvas = document.querySelector('#gl-canvas');
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true });  // alpha: threejs transparent background
  // call shadow rendering in renderer
  renderer.shadowMap.enabled = true;

  for (var i = 5; i <= textureNum; i++) {
    var item = document.querySelector('#ui .tiles input[type=radio][id=voxel' + i + ']+ label');
    item.style.visibility = "hidden";
  }

  const cellSize = 50; //Area of size 50×50×50


  /* Camera */
  const fov = 45;
  const aspect = 2;  // the canvas default
  const near = 0.1;
  const far = 1000;

  //Perspective Camera
  const camera = new THREE.PerspectiveCamera(fov, aspect, near, far);

  //The starting coordinates of the camera
  camera.position.set(20, 10, 20);

  //controls : OrbitCamera control in Threejs
  const controls = new THREE.OrbitControls(camera, canvas);
  controls.target.set(20, 10, 40); //orbit control target(platform)
  controls.update();

  /* Scene */
  const scene = new THREE.Scene();
  renderer.setClearColor(0x000000, 0); // the default

  /* AmbientLight */
  const color = 0xFFFFFF;
  var ambientlight = new THREE.AmbientLight(color, 0.7);
  scene.add(ambientlight);

  /* DirectionalLight */
  light = new THREE.DirectionalLight(0xFFAAAA, 0.5);
  // add shadow to directional light 
  light.castShadow = true;
  // additional option for shadow
  light.shadow.bias = -0.01;
  light.shadowDarkness = 0.5;
  // shadow camera setting
  light.shadowCameraNear = 2;
  light.shadowCameraFar = 80;
  light.shadowCameraLeft = -30;
  light.shadowCameraRight = 30;
  light.shadowCameraTop = 30;
  light.shadowCameraBottom = -30;

  // initial setting of directional light position
  light.position.set(-25, 30, 25);

  // flag on night buttion
  var nightbuttonpressed = 0; // 1 -> night,  0 -> daytime

  /* for the slab voxel */
  const slab_toggle_text = document.querySelector("#slab_toggle_text");
  slab_toggle_text.innerText = `${slab_toggle} height: ${full_height}`; // slab toggle, height of block
  document.getElementById("slab_toggle_button").onclick = function () {
    slab_toggle = !slab_toggle;
    console.log('slab_toggle:', slab_toggle);

    if (slab_toggle) full_height = 1;
    else full_height = 0.5;

    // draw all voxel again with new height
    VoxelWorld.faces = [

      { // left
        uvRow: 0,
        dir: [-1, 0, 0,],
        corners: [
          { pos: [0, full_height, 0], uv: [0, 0.5], },
          { pos: [0, 0, 0], uv: [0, 0], },
          { pos: [0, full_height, 1], uv: [1, 0.5], },
          { pos: [0, 0, 1], uv: [1, 0], },
        ],
      },
      { // right
        uvRow: 0,
        dir: [1, 0, 0,],
        corners: [
          { pos: [1, full_height, 1], uv: [0, 1], },
          { pos: [1, 0, 1], uv: [0, 0], },
          { pos: [1, full_height, 0], uv: [1, 1], },
          { pos: [1, 0, 0], uv: [1, 0], },
        ],
      },
      { // bottom
        uvRow: 1,
        dir: [0, -1, 0,],
        corners: [
          { pos: [1, 0, 1], uv: [1, 0], },
          { pos: [0, 0, 1], uv: [0, 0], },
          { pos: [1, 0, 0], uv: [1, 1], },
          { pos: [0, 0, 0], uv: [0, 1], },
        ],
      },
      { // top
        uvRow: 2,
        dir: [0, 1, 0,],
        corners: [
          { pos: [0, full_height, 1], uv: [1, 1], },
          { pos: [1, full_height, 1], uv: [0, 1], },
          { pos: [0, full_height, 0], uv: [1, 0], },
          { pos: [1, full_height, 0], uv: [0, 0], },
        ],
      },
      { // back
        uvRow: 0,
        dir: [0, 0, -1,],
        corners: [
          { pos: [1, 0, 0], uv: [0, 0], },
          { pos: [0, 0, 0], uv: [1, 0], },
          { pos: [1, full_height, 0], uv: [0, 1], },
          { pos: [0, full_height, 0], uv: [1, 1], },
        ],
      },
      { // front
        uvRow: 0,
        dir: [0, 0, 1,],
        corners: [
          { pos: [0, 0, 1], uv: [0, 0], },
          { pos: [1, 0, 1], uv: [1, 0], },
          { pos: [0, full_height, 1], uv: [0, 1], },
          { pos: [1, full_height, 1], uv: [1, 1], },
        ],
      },
    ];

    slab_toggle_text.innerText = `${slab_toggle} hegiht: ${full_height}`; // slab toggle, height of block
    render();
  }

  /* time slider */
  var x = 0;
  document.getElementById("timeslider").onchange = function () {
    x = event.srcElement.value;

    // depending on x value, get background color & directional light color & directional light position
    if (x < -10) {
      document.body.style.setProperty("--upper-bg-color", 'pink');  // setProperty of CSS background attribute
      document.body.style.setProperty("--down-bg-color", 'blue');
      if (nightbuttonpressed)
        light.color.setHex(0xFFFFFF);
      else
        light.color.setHex(0xFFAAAA);
    }
    else if (x < 0) {
      document.body.style.setProperty("--upper-bg-color", '#FF99FF');
      document.body.style.setProperty("--down-bg-color", '#0066FF');
      if (nightbuttonpressed)
        light.color.setHex(0xFFFFFF);
      else
        light.color.setHex(0xFFAAAA);
    }
    else if (x < 10) {
      document.body.style.setProperty("--upper-bg-color", '#CC99FF');
      document.body.style.setProperty("--down-bg-color", '#3399FF');
      if (nightbuttonpressed)
        light.color.setHex(0xFFFFFF);
      else
        light.color.setHex(0xAAAAFF);
    }
    else if (x < 40) {
      document.body.style.setProperty("--upper-bg-color", '#99CCFF');
      document.body.style.setProperty("--down-bg-color", '#66CCFF');
      if (nightbuttonpressed)
        light.color.setHex(0xFFFFFF);
      else
        light.color.setHex(0xFFFFFF);
    }
    else if (x < 50) {
      document.body.style.setProperty("--upper-bg-color", '#FF9966');
      document.body.style.setProperty("--down-bg-color", '#FFCCFF');
      if (nightbuttonpressed)
        light.color.setHex(0xFFFFFF);
      else
        light.color.setHex(0XFFCCAA);

    }
    else if (x < 60) {
      document.body.style.setProperty("--upper-bg-color", '#FF9933');
      document.body.style.setProperty("--down-bg-color", 'pink');
      if (nightbuttonpressed)
        light.color.setHex(0xFFFFFF);
      else
        light.color.setHex(0XFFCCAA);
    }
    else if (x < 76) {
      document.body.style.setProperty("--upper-bg-color", '#FF6600');
      document.body.style.setProperty("--down-bg-color", '#FFFF99');
      if (nightbuttonpressed)
        light.color.setHex(0xFFFFFF);
      else
        light.color.setHex(0XFFCCAA);
    }

    // set light position
    light.position.set(x, 30, 25);

    render();
  };

  // The direction of the light target (same target)
  light.target.position.set(25, 0, 25);
  scene.add(light, light.target);

  /* background cloud */
  function createClouds(radius, segments) {
    // Mesh
    return new THREE.Mesh(
      // geometry
      new THREE.SphereGeometry(radius, segments, segments),
      // material
      new THREE.MeshBasicMaterial({
        map: THREE.ImageUtils.loadTexture('src/images/fair_clouds_4k.png'),
        side: THREE.BackSide,
        transparent: true
      })
    );
  }

  /* background stars */
  function createStars(radius, segments) {
    // Mesh
    return new THREE.Mesh(
      // geometry
      new THREE.SphereGeometry(radius, segments, segments),
      // material
      new THREE.MeshBasicMaterial({
        map: THREE.ImageUtils.loadTexture('src/images/galaxy_starfield.png'),
        side: THREE.BackSide
      })
    );
  }

  // add clouds with huge sphere 
  var clouds = createClouds(80, 64);
  // position of sphere 
  clouds.position.set(25, 20, 30);
  scene.add(clouds);

  // add stars 
  var stars = createStars(80, 64);
  stars.position.set(25, 20, 30);

  /* night button */
  // nightbuttonpressed  1 -> night,  0 -> daytime
  document.getElementById("nightbutton").onclick = function () {
    // console.log(nightbuttonpressed);

    if (nightbuttonpressed)   // night to daytime
      nightbuttonpressed = 0;
    else                      // daytime to night
      nightbuttonpressed = 1;

    // changed to night
    if (nightbuttonpressed) {

      scene.remove(clouds);
      scene.add(stars);

      // down the intensity of ambient light
      ambientlight.intensity = 0.2;

      scene.add(ambientlight);
    }

    // changed to daytime
    if (!nightbuttonpressed) {

      scene.remove(stars);
      scene.add(clouds);

      ambientlight.intensity = 0.7

      scene.add(ambientlight);
    }

    render();
  }

  /*  bring textuers */
  const loader = new THREE.TextureLoader();
  let texture = loader.load(src = "src/textures/my-craft-texture-16.png");
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;

  // control textures on the texture atlas
  const tileSize = 1024; // texture size
  const tileTextureWidth = 1024 * textureNum; // texture atlas width
  const tileTextureHeight = 4096; // texture atlas height
  const world = new VoxelWorld({
    cellSize,
    tileSize,
    tileTextureWidth,
    tileTextureHeight,
  });

  const material = new THREE.MeshLambertMaterial({
    map: texture,
    side: THREE.DoubleSide,
    alphaTest: 0.1,
    transparent: true,
  });

  const cellIdToMesh = {};
  // generating the geometry for one cell and make it handle
  function updateCellGeometry(x, y, z) {
    const cellX = Math.floor(x / cellSize);
    const cellY = Math.floor(y / cellSize);
    const cellZ = Math.floor(z / cellSize);
    const cellId = world.computeCellId(x, y, z);
    let mesh = cellIdToMesh[cellId]; // check mesh with index map and cell id
    const geometry = mesh ? mesh.geometry : new THREE.BufferGeometry();

    const { positions, normals, uvs, indices } = world.generateGeometryDataForCell(cellX, cellY, cellZ);
    const positionNumComponents = 3;
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), positionNumComponents));
    const normalNumComponents = 3;
    geometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(normals), normalNumComponents));
    const uvNumComponents = 2;
    geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uvs), uvNumComponents));
    geometry.setIndex(indices);
    geometry.computeBoundingSphere();

    if (!mesh) {
      mesh = new THREE.Mesh(geometry, material);
      mesh.name = cellId;
      cellIdToMesh[cellId] = mesh;
      // To cast a shadow over an object
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      scene.add(mesh);
      mesh.position.set(cellX * cellSize, cellY * cellSize, cellZ * cellSize);
    }
  }

  const neighborOffsets = [
    [0, 0, 0], // self
    [-1, 0, 0], // left
    [1, 0, 0], // right
    [0, -1, 0], // down
    [0, 1, 0], // up
    [0, 0, -1], // back
    [0, 0, 1], // front
  ];
  // update voxel geometry with the cell info
  function updateVoxelGeometry(x, y, z) {
    const updatedCellIds = {};
    for (const offset of neighborOffsets) {
      const ox = x + offset[0];
      const oy = y + offset[1];
      const oz = z + offset[2];
      const cellId = world.computeCellId(ox, oy, oz);
      if (!updatedCellIds[cellId]) {
        updatedCellIds[cellId] = true;
        updateCellGeometry(ox, oy, oz);
      }
    }
  }

  // create platform
  for (let y = 0; y < cellSize; ++y) {
    for (let z = 0; z < cellSize; ++z) {
      for (let x = 0; x < cellSize; ++x) {
        let height = 3;
        if (y < height) {
          world.setVoxel(x, y, z, 1);//use first texture
        }
      }
    }
  }

  updateVoxelGeometry(0, 0, 0);  // 0,0,0 will generate

  // display resize
  function resizeRendererToDisplaySize(renderer) {
    const canvas = renderer.domElement;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const needResize = canvas.width !== width || canvas.height !== height;
    if (needResize) {
      renderer.setSize(width, height, false);
    }
    return needResize;
  }

  let renderRequested = false;

  function render() {
    //renderRequested = undefined;
    renderRequested = false
    if (resizeRendererToDisplaySize(renderer)) {
      const canvas = renderer.domElement;
      camera.aspect = canvas.clientWidth / canvas.clientHeight;
      camera.updateProjectionMatrix();
    }

    controls.update();
    renderer.render(scene, camera);
  }
  render();

  let currentVoxel = 0;
  let currentId;

  document.querySelectorAll('#ui .tiles input[type=radio][name=voxel]').forEach((elem) => {
    elem.addEventListener('click', allowUncheck);
  });

  function allowUncheck() {
    if (this.id === currentId) {
      this.checked = false;
      currentId = undefined;
      currentVoxel = 0;
    } else {
      currentId = this.id;
      currentVoxel = parseInt(this.value);
    }
  }

  function getCanvasRelativePosition(event) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * canvas.width / rect.width,
      y: (event.clientY - rect.top) * canvas.height / rect.height,
    };
  }

  let placeVoxelCount = 0;
  let userlevel = 0;
  let width = 0;
  const levelWeight = 0.1;
  const level = document.querySelector("#levelText");
  level.innerText = `Lv. ${userlevel}`; // user level




  function placeVoxel(event) {
    const pos = getCanvasRelativePosition(event);
    const x = (pos.x / canvas.width) * 2 - 1;
    const y = (pos.y / canvas.height) * -2 + 1;

    const start = new THREE.Vector3();
    const end = new THREE.Vector3();
    start.setFromMatrixPosition(camera.matrixWorld);
    end.set(x, y, 1).unproject(camera);

    const intersection = world.intersectRay(start, end);
    if (intersection) {

      var isRightButton;
      event = event || window.event;

      if ("which" in event)  // Gecko (Firefox), WebKit (Safari/Chrome) & Opera
        isRightButton = event.which == 3;
      else if ("button" in event)  // IE, Opera 
        isRightButton = event.button == 2;

      if (isRightButton == 1 && currentVoxel == 0) return;

      const voxelId = isRightButton ? currentVoxel : 0;
      /**
       * Reduce voxel (currentVoxel = 0)
       * Adding voxel (currentVoxel > 0)
       **/
      const pos = intersection.position.map((v, ndx) => {
        return v + intersection.normal[ndx] * (voxelId > 0 ? 0.5 : -0.5);
      });
      // If it's out of range, user can't create voxel
      if ((pos[0] > 0 && pos[0] < 50) && (pos[2] > 0 && pos[2] < 50)) {
        world.setVoxel(...pos, voxelId);
        updateVoxelGeometry(...pos);
        requestRenderIfNotRequested();



        // level
        if (voxelId != 0) { // If user create voxel
          placeVoxelCount += levelWeight;
          placeVoxelCount = parseFloat(placeVoxelCount.toFixed(1));
          moveProgress();
          if (placeVoxelCount % 1 == 0) {
            levelup();
          }
        }
      }
    }
  }


  const mouse = {
    x: 0,
    y: 0,
  };


  function levelup() {
    userlevel += 1;
    level.innerText = `Lv. ${userlevel}`; // user level

    switch (userlevel) {
      case 1:
        for (var i = 5; i <= 8; i++) {
          var item = document.querySelector('#ui .tiles input[type=radio][id=voxel' + i + ']+ label');
          item.style.visibility = "visible";
        }
        break;
      case 2:
        for (var i = 9; i <= 12; i++) {
          var item = document.querySelector('#ui .tiles input[type=radio][id=voxel' + i + ']+ label');
          item.style.visibility = "visible";
        }
        break;
      case 3:
        for (var i = 13; i <= 16; i++) {
          var item = document.querySelector('#ui .tiles input[type=radio][id=voxel' + i + ']+ label');
          item.style.visibility = "visible";
        }
        break;
      default:
        break;
    }
  }

  // user level ui bar
  function moveProgress() {
    const ele = document.getElementById('progsNum');

    if (width >= 90) {
      width = 0;
      ele.style.width = width + "%";
      ele.innerHTML = width + "%";
    } else {
      width = width + levelWeight * 100;
      ele.style.width = width + "%";
      ele.innerHTML = width + "%";
    }

    console.log('width:', width);
  }






  function recordStartPosition(event) {
    mouse.x = event.clientX;
    mouse.y = event.clientY;
    mouse.moveX = 0;
    mouse.moveY = 0;
  }
  function recordMovement(event) {
    mouse.moveX += Math.abs(mouse.x - event.clientX);
    mouse.moveY += Math.abs(mouse.y - event.clientY);
  }
  function placeVoxelIfNoMovement(event) {
    if (mouse.moveX < 5 && mouse.moveY < 5) {
      placeVoxel(event);
    }
    window.removeEventListener('pointermove', recordMovement);
    window.removeEventListener('pointerup', placeVoxelIfNoMovement);
  }
  canvas.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    recordStartPosition(event);
    window.addEventListener('pointermove', recordMovement);
    window.addEventListener('pointerup', placeVoxelIfNoMovement);
  }, { passive: false });
  canvas.addEventListener('touchstart', (event) => {
    // prevent scrolling
    event.preventDefault();
  }, { passive: false });

  function requestRenderIfNotRequested() {
    if (!renderRequested) {
      renderRequested = true;
      requestAnimationFrame(render);
    }
  }

  controls.addEventListener('change', requestRenderIfNotRequested);
  window.addEventListener('resize', requestRenderIfNotRequested);
}

main();